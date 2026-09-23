import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';

describe('Habits: entries (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let userA: TestUser;
  let userB: TestUser;

  const createHabit = (user: TestUser, body: Record<string, unknown> = {}) =>
    request(app.getHttpServer()).post('/api/v1/habits').set(bearer(user.token)).send({ title: 'Read before bed', type: 'build', schedule: 'daily', ...body }).expect(201);
  const listEntries = (user: TestUser, habitId: string, query: Record<string, string> = {}) =>
    request(app.getHttpServer()).get(`/api/v1/habits/${habitId}/entries`).query(query).set(bearer(user.token));
  const upsertEntry = (user: TestUser, habitId: string, body: Record<string, unknown> = {}) =>
    request(app.getHttpServer()).post(`/api/v1/habits/${habitId}/entries`).set(bearer(user.token)).send(body);
  const patchEntry = (user: TestUser, habitId: string, entryId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).patch(`/api/v1/habits/${habitId}/entries/${entryId}`).set(bearer(user.token)).send(body);
  const delEntry = (user: TestUser, habitId: string, entryId: string) =>
    request(app.getHttpServer()).delete(`/api/v1/habits/${habitId}/entries/${entryId}`).set(bearer(user.token));

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('creating/upserting an entry', () => {
    it('defaults to today with status done', async () => {
      const habit = await createHabit(userA);
      const res = await upsertEntry(userA, habit.body.id).expect(200);
      expect(res.body).toMatchObject({ habitId: habit.body.id, status: 'done', note: null, source: 'manual' });
      expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('accepts an explicit date and status', async () => {
      const habit = await createHabit(userA, { type: 'break' });
      const res = await upsertEntry(userA, habit.body.id, { date: '2026-09-20', status: 'slipped', note: 'Had one' }).expect(200);
      expect(res.body).toMatchObject({ date: '2026-09-20', status: 'slipped', note: 'Had one' });
    });

    it('upserts by date: posting the same date again updates rather than duplicating', async () => {
      const habit = await createHabit(userA);
      const first = await upsertEntry(userA, habit.body.id, { date: '2026-09-15', status: 'done' }).expect(200);
      const second = await upsertEntry(userA, habit.body.id, { date: '2026-09-15', status: 'done', note: 'Updated' }).expect(200);
      expect(second.body.id).toBe(first.body.id);
      expect(second.body.note).toBe('Updated');

      const list = await listEntries(userA, habit.body.id, { from: '2026-09-15', to: '2026-09-15' }).expect(200);
      expect(list.body).toHaveLength(1);
    });

    it('rejects a malformed date', async () => {
      const habit = await createHabit(userA);
      await upsertEntry(userA, habit.body.id, { date: '2026-02-30' }).expect(400);
      await upsertEntry(userA, habit.body.id, { date: 'not-a-date' }).expect(400);
    });

    it('rejects a bad status', async () => {
      const habit = await createHabit(userA);
      await upsertEntry(userA, habit.body.id, { status: 'not-a-status' }).expect(400);
    });

    it('is 404 for another user\'s habit', async () => {
      const habit = await createHabit(userA);
      await request(app.getHttpServer()).post(`/api/v1/habits/${habit.body.id}/entries`).set(bearer(userB.token)).send({}).expect(404);
    });

    it('replays an Idempotency-Key instead of writing twice', async () => {
      const habit = await createHabit(userA);
      const key = { 'Idempotency-Key': `entry-${randomUUID()}` };
      const first = await request(app.getHttpServer()).post(`/api/v1/habits/${habit.body.id}/entries`).set(bearer(userA.token)).set(key).send({ date: '2026-09-16' }).expect(200);
      const replay = await request(app.getHttpServer()).post(`/api/v1/habits/${habit.body.id}/entries`).set(bearer(userA.token)).set(key).send({ date: '2026-09-16' }).expect(200);
      expect(replay.body).toEqual(first.body);
    });

    it('requires authentication', async () => {
      const habit = await createHabit(userA);
      await request(app.getHttpServer()).post(`/api/v1/habits/${habit.body.id}/entries`).send({}).expect(401);
    });
  });

  describe('listing entries', () => {
    it('defaults to the last 30 days, ascending by date', async () => {
      const habit = await createHabit(userA);
      await upsertEntry(userA, habit.body.id, { date: '2026-09-10' }).expect(200);
      await upsertEntry(userA, habit.body.id, { date: '2026-09-05' }).expect(200);

      const res = await listEntries(userA, habit.body.id, { from: '2026-09-01', to: '2026-09-30' }).expect(200);
      expect(res.body.map((e: { date: string }) => e.date)).toEqual(['2026-09-05', '2026-09-10']);
    });

    it('filters by from/to range', async () => {
      const habit = await createHabit(userA);
      await upsertEntry(userA, habit.body.id, { date: '2026-01-01' }).expect(200);
      await upsertEntry(userA, habit.body.id, { date: '2026-06-01' }).expect(200);
      const res = await listEntries(userA, habit.body.id, { from: '2026-05-01', to: '2026-07-01' }).expect(200);
      expect(res.body.map((e: { date: string }) => e.date)).toEqual(['2026-06-01']);
    });

    it('excludes a deleted entry', async () => {
      const habit = await createHabit(userA);
      const entry = await upsertEntry(userA, habit.body.id, { date: '2026-09-12' }).expect(200);
      await delEntry(userA, habit.body.id, entry.body.id).expect(204);
      const res = await listEntries(userA, habit.body.id, { from: '2026-09-01', to: '2026-09-30' }).expect(200);
      expect(res.body.map((e: { id: string }) => e.id)).not.toContain(entry.body.id);
    });

    it('is 404 for another user\'s habit', async () => {
      const habit = await createHabit(userA);
      await listEntries(userB, habit.body.id).expect(404);
    });

    it('rejects a malformed from/to', async () => {
      const habit = await createHabit(userA);
      await listEntries(userA, habit.body.id, { from: 'nope' }).expect(400);
    });

    it('requires authentication', async () => {
      const habit = await createHabit(userA);
      await request(app.getHttpServer()).get(`/api/v1/habits/${habit.body.id}/entries`).expect(401);
    });
  });

  describe('updating and deleting an entry', () => {
    it('updates status and note', async () => {
      const habit = await createHabit(userA);
      const entry = await upsertEntry(userA, habit.body.id, { date: '2026-09-18', status: 'done' }).expect(200);
      const updated = await patchEntry(userA, habit.body.id, entry.body.id, { status: 'slipped', note: 'Actually missed it' }).expect(200);
      expect(updated.body).toMatchObject({ status: 'slipped', note: 'Actually missed it' });
    });

    it('can null out note explicitly', async () => {
      const habit = await createHabit(userA);
      const entry = await upsertEntry(userA, habit.body.id, { date: '2026-09-19', note: 'Has a note' }).expect(200);
      const updated = await patchEntry(userA, habit.body.id, entry.body.id, { note: null }).expect(200);
      expect(updated.body.note).toBeNull();
    });

    it('is 404 for another user\'s habit or entry', async () => {
      const habit = await createHabit(userA);
      const entry = await upsertEntry(userA, habit.body.id, { date: '2026-09-21' }).expect(200);
      await patchEntry(userB, habit.body.id, entry.body.id, { status: 'slipped' }).expect(404);
      await delEntry(userB, habit.body.id, entry.body.id).expect(404);
    });

    it('is 404 for a nonexistent entry id under an owned habit', async () => {
      const habit = await createHabit(userA);
      await patchEntry(userA, habit.body.id, '2a3b4c5d-0000-4000-8000-000000000000', { status: 'slipped' }).expect(404);
    });

    it('deletes the entry, which then no longer lists', async () => {
      const habit = await createHabit(userA);
      const entry = await upsertEntry(userA, habit.body.id, { date: '2026-09-22' }).expect(200);
      await delEntry(userA, habit.body.id, entry.body.id).expect(204);
      await delEntry(userA, habit.body.id, entry.body.id).expect(404); // already gone
    });

    it('re-upserting the same date after delete revives the entry', async () => {
      const habit = await createHabit(userA);
      const entry = await upsertEntry(userA, habit.body.id, { date: '2026-09-23', note: 'first' }).expect(200);
      await delEntry(userA, habit.body.id, entry.body.id).expect(204);
      const revived = await upsertEntry(userA, habit.body.id, { date: '2026-09-23', note: 'second' }).expect(200);
      expect(revived.body.note).toBe('second');
      const res = await listEntries(userA, habit.body.id, { from: '2026-09-23', to: '2026-09-23' }).expect(200);
      expect(res.body).toHaveLength(1);
    });

    it('requires authentication', async () => {
      const habit = await createHabit(userA);
      const entry = await upsertEntry(userA, habit.body.id, { date: '2026-09-24' }).expect(200);
      await request(app.getHttpServer()).patch(`/api/v1/habits/${habit.body.id}/entries/${entry.body.id}`).send({}).expect(401);
      await request(app.getHttpServer()).delete(`/api/v1/habits/${habit.body.id}/entries/${entry.body.id}`).expect(401);
    });
  });
});
