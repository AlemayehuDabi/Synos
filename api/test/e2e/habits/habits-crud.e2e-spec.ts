import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';

describe('Habits: CRUD (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let userA: TestUser;
  let userB: TestUser;

  const create = (user: TestUser, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/v1/habits').set(bearer(user.token)).send(body);
  const get = (user: TestUser, id: string) => request(app.getHttpServer()).get(`/api/v1/habits/${id}`).set(bearer(user.token));
  const list = (user: TestUser, query: Record<string, string> = {}) =>
    request(app.getHttpServer()).get('/api/v1/habits').query(query).set(bearer(user.token));
  const patch = (user: TestUser, id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).patch(`/api/v1/habits/${id}`).set(bearer(user.token)).send(body);
  const del = (user: TestUser, id: string) => request(app.getHttpServer()).delete(`/api/v1/habits/${id}`).set(bearer(user.token));
  const archive = (user: TestUser, id: string) => request(app.getHttpServer()).post(`/api/v1/habits/${id}/archive`).set(bearer(user.token)).send({});

  const daily = (overrides: Record<string, unknown> = {}) => ({ title: 'Read before bed', type: 'build', schedule: 'daily', ...overrides });

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('creating a habit', () => {
    it('creates a daily build habit with defaults', async () => {
      const res = await create(userA, daily()).expect(201);
      expect(res.body).toMatchObject({
        title: 'Read before bed',
        notes: null,
        type: 'build',
        schedule: 'daily',
        scheduleDays: [],
        targetPerPeriod: null,
        timezone: 'UTC',
        color: null,
        isArchived: false,
        archivedAt: null,
        source: 'manual',
      });
      expect(res.body.id).toEqual(expect.any(String));

      const fetched = await get(userA, res.body.id).expect(200);
      expect(fetched.body).toEqual(res.body);
    });

    it('creates a break habit', async () => {
      const res = await create(userA, { title: 'No sugary drinks', type: 'break', schedule: 'daily' }).expect(201);
      expect(res.body.type).toBe('break');
    });

    it('creates a specificDays habit with scheduleDays', async () => {
      const res = await create(userA, daily({ schedule: 'specificDays', scheduleDays: [1, 3, 5] })).expect(201);
      expect(res.body.scheduleDays).toEqual([1, 3, 5]);
    });

    it('creates a timesPerWeek habit with targetPerPeriod', async () => {
      const res = await create(userA, daily({ schedule: 'timesPerWeek', targetPerPeriod: 3 })).expect(201);
      expect(res.body.targetPerPeriod).toBe(3);
    });

    it('requires scheduleDays for specificDays', async () => {
      await create(userA, daily({ schedule: 'specificDays' })).expect(400);
      await create(userA, daily({ schedule: 'specificDays', scheduleDays: [] })).expect(400);
    });

    it('requires targetPerPeriod for timesPerWeek/timesPerMonth', async () => {
      await create(userA, daily({ schedule: 'timesPerWeek' })).expect(400);
      await create(userA, daily({ schedule: 'timesPerMonth' })).expect(400);
    });

    it('defaults timezone to the caller\'s own', async () => {
      const res = await create(userA, daily()).expect(201);
      expect(res.body.timezone).toBe('UTC');
    });

    it('accepts a client-supplied id, and rejects a repeat of the same id with 409', async () => {
      const id = randomUUID();
      const first = await create(userA, { ...daily(), id }).expect(201);
      expect(first.body.id).toBe(id);
      const repeat = await create(userA, { ...daily(), id }).expect(409);
      expect(repeat.body).toMatchObject({ statusCode: 409, error: 'CONFLICT' });
    });

    it('rejects a client-supplied id that collides with another user\'s habit', async () => {
      const id = randomUUID();
      await create(userA, { ...daily(), id }).expect(201);
      const res = await create(userB, { ...daily(), id }).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'CONFLICT' });
    });

    it.each([
      ['no title', { title: undefined }],
      ['an empty title', { title: '' }],
      ['no type', { type: undefined }],
      ['a bad type', { type: 'neutral' }],
      ['no schedule', { schedule: undefined }],
      ['a bad schedule', { schedule: 'never' }],
      ['scheduleDays out of range', { schedule: 'specificDays', scheduleDays: [0, 7] }],
      ['a bad timezone', { timezone: 'Not/AZone' }],
      ['a non-UUID client id', { id: 'not-a-uuid' }],
      ['an unknown property', { extra: 'nope' }],
    ])('rejects %s with a 400 and the standard error shape', async (_name, override) => {
      const res = await create(userA, daily(override)).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'BAD_REQUEST' });
      expect(res.body.message).toEqual(expect.any(String));
    });

    it('replays an Idempotency-Key instead of creating a second habit', async () => {
      const key = { 'Idempotency-Key': `create-${randomUUID()}` };
      const first = await request(app.getHttpServer()).post('/api/v1/habits').set(bearer(userA.token)).set(key).send(daily({ title: 'Once' })).expect(201);
      const replay = await request(app.getHttpServer()).post('/api/v1/habits').set(bearer(userA.token)).set(key).send(daily({ title: 'Once' })).expect(201);
      expect(replay.body).toEqual(first.body);

      const { body } = await list(userA, { limit: '100' }).expect(200);
      expect(body.items.filter((h: { title: string }) => h.title === 'Once')).toHaveLength(1);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).post('/api/v1/habits').send(daily()).expect(401);
    });
  });

  describe('reading a habit', () => {
    it('is 404 for another user\'s habit, exactly as for one that does not exist', async () => {
      const mine = await create(userA, daily()).expect(201);
      const stranger = await get(userB, mine.body.id).expect(404);
      const missing = await get(userB, '2a3b4c5d-0000-4000-8000-000000000000').expect(404);
      expect(stranger.body).toEqual(missing.body);
    });

    it('is 400 for an id that is not a UUID, and 401 without a session', async () => {
      await get(userA, 'not-a-uuid').expect(400);
      await request(app.getHttpServer()).get('/api/v1/habits/2a3b4c5d-0000-4000-8000-000000000000').expect(401);
    });
  });

  describe('listing habits', () => {
    it('lists ascending by creation order, and only the caller\'s own', async () => {
      const isolated = await signUpAndVerify(app, sentMails);
      const h1 = await create(isolated, daily({ title: 'First' })).expect(201);
      const h2 = await create(isolated, daily({ title: 'Second' })).expect(201);
      const h3 = await create(isolated, daily({ title: 'Third' })).expect(201);

      const { body } = await list(isolated, { limit: '100' }).expect(200);
      const mine = body.items.filter((h: { id: string }) => [h1.body.id, h2.body.id, h3.body.id].includes(h.id));
      expect(mine.map((h: { title: string }) => h.title)).toEqual(['First', 'Second', 'Third']);
    });

    it('pages through results without skipping or repeating any', async () => {
      const isolated = await signUpAndVerify(app, sentMails);
      const created = [];
      for (let i = 0; i < 5; i += 1) {
        const res = await create(isolated, daily({ title: `H${i}` })).expect(201);
        created.push(res.body.id);
      }
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let pages = 0; pages < 10; pages += 1) {
        const res = await list(isolated, { limit: '2', ...(cursor ? { cursor } : {}) }).expect(200);
        expect(res.body.items.length).toBeLessThanOrEqual(2);
        seen.push(...res.body.items.map((h: { id: string }) => h.id));
        cursor = res.body.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(created.every((id) => seen.includes(id))).toBe(true);
      expect(new Set(seen).size).toBe(seen.length);
    });

    it('filters by type and isArchived', async () => {
      const isolated = await signUpAndVerify(app, sentMails);
      const build = await create(isolated, daily({ title: 'Build one' })).expect(201);
      const brk = await create(isolated, { title: 'Break one', type: 'break', schedule: 'daily' }).expect(201);
      await archive(isolated, brk.body.id).expect(200);

      const builds = await list(isolated, { type: 'build', limit: '100' }).expect(200);
      expect(builds.body.items.map((h: { id: string }) => h.id)).toContain(build.body.id);
      expect(builds.body.items.map((h: { id: string }) => h.id)).not.toContain(brk.body.id);

      const archived = await list(isolated, { isArchived: 'true', limit: '100' }).expect(200);
      expect(archived.body.items.map((h: { id: string }) => h.id)).toContain(brk.body.id);
      expect(archived.body.items.map((h: { id: string }) => h.id)).not.toContain(build.body.id);

      const active = await list(isolated, { isArchived: 'false', limit: '100' }).expect(200);
      expect(active.body.items.map((h: { id: string }) => h.id)).toContain(build.body.id);
    });

    it('rejects a bad limit or cursor', async () => {
      for (const query of [{ limit: '0' }, { limit: '101' }, { cursor: 'nonsense' }]) {
        await list(userA, query).expect(400);
      }
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/habits').expect(401);
    });
  });

  describe('updating and deleting', () => {
    it('updates fields in place', async () => {
      const created = await create(userA, daily()).expect(201);
      const updated = await patch(userA, created.body.id, { title: 'Renamed', color: '#fff' }).expect(200);
      expect(updated.body).toMatchObject({ id: created.body.id, title: 'Renamed', color: '#fff' });
    });

    it('can null out an optional field explicitly', async () => {
      const created = await create(userA, daily({ notes: 'Some notes' })).expect(201);
      const updated = await patch(userA, created.body.id, { notes: null }).expect(200);
      expect(updated.body.notes).toBeNull();
    });

    it('switches schedule kind, clearing fields that no longer apply', async () => {
      const created = await create(userA, daily({ schedule: 'specificDays', scheduleDays: [1, 2] })).expect(201);
      const updated = await patch(userA, created.body.id, { schedule: 'daily' }).expect(200);
      expect(updated.body.scheduleDays).toEqual([]);
    });

    it('requires scheduleDays when switching to specificDays', async () => {
      const created = await create(userA, daily()).expect(201);
      await patch(userA, created.body.id, { schedule: 'specificDays' }).expect(400);
    });

    it('is 404 for another user\'s habit', async () => {
      const created = await create(userA, daily()).expect(201);
      await patch(userB, created.body.id, { title: 'Hijacked' }).expect(404);
      await del(userB, created.body.id).expect(404);
    });

    it('deletes the habit, which then 404s', async () => {
      const created = await create(userA, daily()).expect(201);
      await del(userA, created.body.id).expect(204);
      await get(userA, created.body.id).expect(404);
      await del(userA, created.body.id).expect(404); // already gone
    });

    it('excludes a deleted habit from the list', async () => {
      const created = await create(userA, daily({ title: 'ToDelete' })).expect(201);
      await del(userA, created.body.id).expect(204);
      const { body } = await list(userA, { limit: '100' }).expect(200);
      expect(body.items.map((h: { id: string }) => h.id)).not.toContain(created.body.id);
    });

    it('requires authentication for PATCH and DELETE', async () => {
      const created = await create(userA, daily()).expect(201);
      await request(app.getHttpServer()).patch(`/api/v1/habits/${created.body.id}`).send({ title: 'x' }).expect(401);
      await request(app.getHttpServer()).delete(`/api/v1/habits/${created.body.id}`).expect(401);
    });
  });

  describe('archiving', () => {
    it('sets isArchived and archivedAt', async () => {
      const created = await create(userA, daily()).expect(201);
      const res = await archive(userA, created.body.id).expect(200);
      expect(res.body.isArchived).toBe(true);
      expect(res.body.archivedAt).toEqual(expect.any(String));
    });

    it('is idempotent: archiving twice does not error or change archivedAt', async () => {
      const created = await create(userA, daily()).expect(201);
      const first = await archive(userA, created.body.id).expect(200);
      const second = await archive(userA, created.body.id).expect(200);
      expect(second.body.archivedAt).toBe(first.body.archivedAt);
    });

    it('is 404 for another user\'s habit', async () => {
      const created = await create(userA, daily()).expect(201);
      await request(app.getHttpServer()).post(`/api/v1/habits/${created.body.id}/archive`).set(bearer(userB.token)).send({}).expect(404);
    });

    it('requires authentication', async () => {
      const created = await create(userA, daily()).expect(201);
      await request(app.getHttpServer()).post(`/api/v1/habits/${created.body.id}/archive`).send({}).expect(401);
    });
  });
});
