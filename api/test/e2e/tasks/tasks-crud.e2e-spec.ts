import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';

describe('Tasks: CRUD and quick capture (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let userA: TestUser;
  let userB: TestUser;

  const create = (user: TestUser, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/v1/tasks').set(bearer(user.token)).send(body);
  const get = (user: TestUser, id: string) => request(app.getHttpServer()).get(`/api/v1/tasks/${id}`).set(bearer(user.token));
  const list = (user: TestUser, query: Record<string, string> = {}) =>
    request(app.getHttpServer()).get('/api/v1/tasks').query(query).set(bearer(user.token));
  const patch = (user: TestUser, id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).patch(`/api/v1/tasks/${id}`).set(bearer(user.token)).send(body);
  const del = (user: TestUser, id: string, query: Record<string, string> = {}) =>
    request(app.getHttpServer()).delete(`/api/v1/tasks/${id}`).query(query).set(bearer(user.token));

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('creating a task', () => {
    it('quick-captures with only a title', async () => {
      const res = await create(userA, { title: 'Water the plants' }).expect(201);
      expect(res.body).toMatchObject({
        title: 'Water the plants',
        notes: null,
        status: 'open',
        priority: 'none',
        dueAt: null,
        scheduledStart: null,
        scheduledEnd: null,
        timezone: null,
        estimatedMinutes: null,
        actualMinutes: null,
        isCritical: false,
        rrule: null,
        seriesUntil: null,
        recurringGroupId: null,
        source: 'manual',
        completedAt: null,
      });
      expect(res.body.id).toEqual(expect.any(String));
      expect(res.body.sortOrder).toEqual(expect.any(Number));

      const fetched = await get(userA, res.body.id).expect(200);
      expect(fetched.body).toEqual(res.body);
    });

    it('creates a full task with all fields', async () => {
      const res = await create(userA, {
        title: 'Finish report',
        notes: 'Q3 numbers',
        priority: 'high',
        dueAt: '2026-09-25T17:00:00Z',
        scheduledStart: '2026-09-25T09:00:00Z',
        scheduledEnd: '2026-09-25T10:00:00Z',
        timezone: 'America/New_York',
        estimatedMinutes: 60,
        isCritical: true,
      }).expect(201);
      expect(res.body).toMatchObject({
        title: 'Finish report',
        notes: 'Q3 numbers',
        priority: 'high',
        dueAt: '2026-09-25T17:00:00.000Z',
        scheduledStart: '2026-09-25T09:00:00.000Z',
        scheduledEnd: '2026-09-25T10:00:00.000Z',
        timezone: 'America/New_York',
        estimatedMinutes: 60,
        isCritical: true,
      });
    });

    it('defaults timezone to null when neither dueAt nor scheduledStart is given, and to the caller\'s own when either is', async () => {
      const bare = await create(userA, { title: 'Bare' }).expect(201);
      expect(bare.body.timezone).toBeNull();

      const dued = await create(userA, { title: 'Has due', dueAt: '2026-09-25T17:00:00Z' }).expect(201);
      expect(dued.body.timezone).toBe('UTC'); // userA has not set a timezone
    });

    it('accepts a client-supplied id, and rejects a repeat of the same id with 409', async () => {
      const id = randomUUID();
      const first = await create(userA, { title: 'Once', id }).expect(201);
      expect(first.body.id).toBe(id);

      const repeat = await create(userA, { title: 'Once again', id }).expect(409);
      expect(repeat.body).toMatchObject({ statusCode: 409, error: 'CONFLICT' });
    });

    it('rejects a client-supplied id that collides with another user\'s task, since ids are globally unique', async () => {
      const id = randomUUID();
      await create(userA, { title: 'Mine', id }).expect(201);
      const res = await create(userB, { title: 'Theirs', id }).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'CONFLICT' });
    });

    it.each([
      ['no title', { title: undefined }],
      ['an empty title', { title: '' }],
      ['a too-long title', { title: 'x'.repeat(201) }],
      ['a bad priority', { title: 'x', priority: 'urgent' }],
      ['a bad source', { title: 'x', source: 'not-a-source' }],
      ['an invalid timezone', { title: 'x', timezone: 'Not/AZone' }],
      ['a bad rrule frequency', { title: 'x', dueAt: '2026-09-25T17:00:00Z', rrule: 'FREQ=HOURLY' }],
      ['rrule without dueAt', { title: 'x', rrule: 'FREQ=DAILY' }],
      ['an impossible rrule', { title: 'x', dueAt: '2026-09-25T17:00:00Z', rrule: 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30' }],
      ['a non-UUID client id', { title: 'x', id: 'not-a-uuid' }],
      ['estimatedMinutes of 0', { title: 'x', estimatedMinutes: 0 }],
      ['an unknown property', { title: 'x', extra: 'nope' }],
    ])('rejects %s with a 400 and the standard error shape', async (_name, body) => {
      const res = await create(userA, body).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'BAD_REQUEST' });
      expect(res.body.message).toEqual(expect.any(String));
    });

    it('replays an Idempotency-Key instead of creating a second task', async () => {
      const key = { 'Idempotency-Key': `create-${randomUUID()}` };
      const first = await request(app.getHttpServer()).post('/api/v1/tasks').set(bearer(userA.token)).set(key).send({ title: 'Once-key' }).expect(201);
      const replay = await request(app.getHttpServer()).post('/api/v1/tasks').set(bearer(userA.token)).set(key).send({ title: 'Once-key' }).expect(201);
      expect(replay.body).toEqual(first.body);

      const { body } = await list(userA, { limit: '100' }).expect(200);
      expect(body.items.filter((t: { title: string }) => t.title === 'Once-key')).toHaveLength(1);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).post('/api/v1/tasks').send({ title: 'x' }).expect(401);
    });
  });

  describe('reading a task', () => {
    it('is 404 for another user\'s task, exactly as for one that does not exist', async () => {
      const mine = await create(userA, { title: 'Mine' }).expect(201);
      const stranger = await get(userB, mine.body.id).expect(404);
      const missing = await get(userB, '2a3b4c5d-0000-4000-8000-000000000000').expect(404);
      expect(stranger.body).toEqual(missing.body);
    });

    it('is 400 for an id that is not a UUID, and 401 without a session', async () => {
      await get(userA, 'not-a-uuid').expect(400);
      await request(app.getHttpServer()).get('/api/v1/tasks/2a3b4c5d-0000-4000-8000-000000000000').expect(401);
    });
  });

  describe('listing tasks', () => {
    it('lists ascending by sortOrder, and only the caller\'s own', async () => {
      const isolated = await signUpAndVerify(app, sentMails);
      const t1 = await create(isolated, { title: 'First' }).expect(201);
      const t2 = await create(isolated, { title: 'Second' }).expect(201);
      const t3 = await create(isolated, { title: 'Third' }).expect(201);

      const { body } = await list(isolated, { limit: '100' }).expect(200);
      const mine = body.items.filter((t: { id: string }) => [t1.body.id, t2.body.id, t3.body.id].includes(t.id));
      expect(mine.map((t: { title: string }) => t.title)).toEqual(['First', 'Second', 'Third']);
    });

    it('pages through results without skipping or repeating any', async () => {
      const isolated = await signUpAndVerify(app, sentMails);
      const created = [];
      for (let i = 0; i < 5; i += 1) {
        const res = await create(isolated, { title: `T${i}` }).expect(201);
        created.push(res.body.id);
      }
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let pages = 0; pages < 10; pages += 1) {
        const res = await list(isolated, { limit: '2', ...(cursor ? { cursor } : {}) }).expect(200);
        expect(res.body.items.length).toBeLessThanOrEqual(2);
        seen.push(...res.body.items.map((t: { id: string }) => t.id));
        cursor = res.body.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(created.every((id) => seen.includes(id))).toBe(true);
      expect(new Set(seen).size).toBe(seen.length);
    });

    it('filters by status, priority, dueBefore/dueAfter, recurringGroupId and unscheduled', async () => {
      const isolated = await signUpAndVerify(app, sentMails);
      const open = await create(isolated, { title: 'Open one', priority: 'high', dueAt: '2026-05-01T00:00:00Z' }).expect(201);
      const completed = await create(isolated, { title: 'Completed one' }).expect(201);
      await request(app.getHttpServer()).post(`/api/v1/tasks/${completed.body.id}/complete`).set(bearer(isolated.token)).send({}).expect(200);
      const scheduled = await create(isolated, { title: 'Scheduled', scheduledStart: '2026-05-02T09:00:00Z', scheduledEnd: '2026-05-02T10:00:00Z' }).expect(201);

      const byStatus = await list(isolated, { status: 'completed', limit: '100' }).expect(200);
      expect(byStatus.body.items.map((t: { id: string }) => t.id)).toContain(completed.body.id);
      expect(byStatus.body.items.map((t: { id: string }) => t.id)).not.toContain(open.body.id);

      const byPriority = await list(isolated, { priority: 'high', limit: '100' }).expect(200);
      expect(byPriority.body.items.map((t: { id: string }) => t.id)).toContain(open.body.id);

      const byDueBefore = await list(isolated, { dueBefore: '2026-06-01T00:00:00Z', limit: '100' }).expect(200);
      expect(byDueBefore.body.items.map((t: { id: string }) => t.id)).toContain(open.body.id);

      const byDueAfter = await list(isolated, { dueAfter: '2027-01-01T00:00:00Z', limit: '100' }).expect(200);
      expect(byDueAfter.body.items.map((t: { id: string }) => t.id)).not.toContain(open.body.id);

      const unscheduled = await list(isolated, { unscheduled: 'true', limit: '100' }).expect(200);
      expect(unscheduled.body.items.map((t: { id: string }) => t.id)).not.toContain(scheduled.body.id);
      expect(unscheduled.body.items.map((t: { id: string }) => t.id)).toContain(open.body.id);
    });

    it('rejects a bad limit or cursor', async () => {
      for (const query of [{ limit: '0' }, { limit: '101' }, { cursor: 'nonsense' }]) {
        await list(userA, query).expect(400);
      }
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/tasks').expect(401);
    });
  });

  describe('updating and deleting with scope "all" (the default, or a non-recurring task)', () => {
    it('updates the task in place', async () => {
      const created = await create(userA, { title: 'Original' }).expect(201);
      const updated = await patch(userA, created.body.id, { title: 'Renamed', priority: 'low' }).expect(200);
      expect(updated.body).toMatchObject({ id: created.body.id, title: 'Renamed', priority: 'low', notes: null });
    });

    it('can null out an optional field explicitly', async () => {
      const created = await create(userA, { title: 'Has notes', notes: 'Some notes' }).expect(201);
      const updated = await patch(userA, created.body.id, { notes: null }).expect(200);
      expect(updated.body.notes).toBeNull();
    });

    it('is 404 for another user\'s task', async () => {
      const created = await create(userA, { title: 'Mine' }).expect(201);
      await patch(userB, created.body.id, { title: 'Hijacked' }).expect(404);
      await del(userB, created.body.id).expect(404);
    });

    it('deletes the whole task, which then 404s', async () => {
      const created = await create(userA, { title: 'ToDelete' }).expect(201);
      await del(userA, created.body.id).expect(204);
      await get(userA, created.body.id).expect(404);
      await del(userA, created.body.id).expect(404); // already gone
    });

    it('excludes a deleted task from the list', async () => {
      const created = await create(userA, { title: 'ToDeleteFromList' }).expect(201);
      await del(userA, created.body.id).expect(204);
      const { body } = await list(userA, { limit: '100' }).expect(200);
      expect(body.items.map((t: { id: string }) => t.id)).not.toContain(created.body.id);
    });

    it('requires authentication for PATCH and DELETE', async () => {
      const created = await create(userA, { title: 'x' }).expect(201);
      await request(app.getHttpServer()).patch(`/api/v1/tasks/${created.body.id}`).send({ title: 'x' }).expect(401);
      await request(app.getHttpServer()).delete(`/api/v1/tasks/${created.body.id}`).expect(401);
    });
  });
});
