import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser, updateSettings } from '../helpers.js';

describe('Fitness: body metrics (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let userA: TestUser;
  let userB: TestUser;

  const http = () => request(app.getHttpServer());
  const create = (user: TestUser, body: Record<string, unknown>) => http().post('/api/v1/body-metrics').set(bearer(user.token)).send(body);
  const list = (user: TestUser, query: Record<string, string> = {}) => http().get('/api/v1/body-metrics').query(query).set(bearer(user.token));
  const patch = (user: TestUser, id: string, body: Record<string, unknown>) => http().patch(`/api/v1/body-metrics/${id}`).set(bearer(user.token)).send(body);
  const del = (user: TestUser, id: string) => http().delete(`/api/v1/body-metrics/${id}`).set(bearer(user.token));

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('recording a metric', () => {
    it('records weight on an explicit date', async () => {
      const res = await create(userA, { date: '2026-09-20', weightKg: 80.4 }).expect(201);
      expect(res.body).toMatchObject({ date: '2026-09-20', weightKg: 80.4, bodyFatPct: null, notes: null, source: 'manual' });
      expect(res.body.id).toEqual(expect.any(String));
    });

    it('records body fat and notes together', async () => {
      const res = await create(userA, { date: '2026-09-21', bodyFatPct: 18.5, notes: 'After breakfast', source: 'sync' }).expect(201);
      expect(res.body).toMatchObject({ bodyFatPct: 18.5, notes: 'After breakfast', source: 'sync' });
    });

    it('defaults the date to today in the caller\'s own timezone', async () => {
      const isolated = await signUpAndVerify(app, sentMails);
      await updateSettings(app, isolated.token, { timezone: 'Pacific/Kiritimati' }); // UTC+14
      const res = await create(isolated, { weightKg: 70 }).expect(201);
      const expected = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Kiritimati' }).format(new Date());
      expect(res.body.date).toBe(expected);
    });

    it('allows several metrics on one date', async () => {
      const first = await create(userA, { date: '2026-09-22', weightKg: 80 }).expect(201);
      const second = await create(userA, { date: '2026-09-22', weightKg: 79.6 }).expect(201);
      expect(second.body.id).not.toBe(first.body.id);
    });

    it.each([
      ['nothing to record', {}],
      ['a date only', { date: '2026-09-20' }],
      ['weightKg of 0', { weightKg: 0 }],
      ['weightKg above the maximum', { weightKg: 1001 }],
      ['bodyFatPct above 100', { bodyFatPct: 101 }],
      ['negative bodyFatPct', { bodyFatPct: -1 }],
      ['a text weight', { weightKg: 'heavy' }],
      ['an impossible date', { date: '2026-02-30', weightKg: 70 }],
      ['a timestamp instead of a date', { date: '2026-09-20T00:00:00Z', weightKg: 70 }],
      ['a bad source', { weightKg: 70, source: 'guess' }],
      ['an unknown property', { weightKg: 70, extra: 1 }],
    ])('rejects %s with a 400 and the standard error shape', async (_name, body) => {
      const res = await create(userA, body).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'BAD_REQUEST' });
      expect(res.body.message).toEqual(expect.any(String));
    });

    it('replays an Idempotency-Key instead of recording twice', async () => {
      const key = { 'Idempotency-Key': `metric-${randomUUID()}` };
      const body = { date: '2026-09-23', weightKg: 81.111 };
      const first = await http().post('/api/v1/body-metrics').set(bearer(userA.token)).set(key).send(body).expect(201);
      const replay = await http().post('/api/v1/body-metrics').set(bearer(userA.token)).set(key).send(body).expect(201);
      expect(replay.body).toEqual(first.body);
      const { body: page } = await list(userA, { from: '2026-09-23', to: '2026-09-23' }).expect(200);
      expect(page.items.filter((m: { weightKg: number }) => m.weightKg === 81.111)).toHaveLength(1);
    });

    it('requires authentication', async () => {
      await http().post('/api/v1/body-metrics').send({ weightKg: 70 }).expect(401);
    });
  });

  describe('listing metrics', () => {
    it('lists newest date first, filtered by an inclusive from/to, and only the caller\'s own', async () => {
      const isolated = await signUpAndVerify(app, sentMails);
      await create(isolated, { date: '2027-01-01', weightKg: 70 }).expect(201);
      await create(isolated, { date: '2027-01-15', weightKg: 71 }).expect(201);
      await create(isolated, { date: '2027-02-01', weightKg: 72 }).expect(201);

      const all = await list(isolated).expect(200);
      expect(all.body.items.map((m: { date: string }) => m.date)).toEqual(['2027-02-01', '2027-01-15', '2027-01-01']);
      const ranged = await list(isolated, { from: '2027-01-01', to: '2027-01-15' }).expect(200);
      expect(ranged.body.items.map((m: { date: string }) => m.date)).toEqual(['2027-01-15', '2027-01-01']);
      expect((await list(userB, { from: '2027-01-01', to: '2027-02-01' }).expect(200)).body.items).toEqual([]);
    });

    it('pages through results without skipping or repeating any', async () => {
      const isolated = await signUpAndVerify(app, sentMails);
      const created: string[] = [];
      for (let i = 1; i <= 5; i += 1) created.push((await create(isolated, { date: `2027-03-0${i}`, weightKg: 60 + i }).expect(201)).body.id);
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let pages = 0; pages < 10; pages += 1) {
        const res = await list(isolated, { limit: '2', ...(cursor ? { cursor } : {}) }).expect(200);
        seen.push(...res.body.items.map((m: { id: string }) => m.id));
        cursor = res.body.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(seen).toEqual([...created].reverse());
    });

    it('rejects a bad limit, cursor or date', async () => {
      for (const query of [{ limit: '0' }, { limit: '101' }, { cursor: 'nonsense' }, { from: 'nope' }, { to: '2026-13-01' }]) {
        await list(userA, query).expect(400);
      }
    });

    it('requires authentication', async () => {
      await http().get('/api/v1/body-metrics').expect(401);
    });
  });

  describe('updating and deleting', () => {
    it('updates values in place, and can clear one while another remains', async () => {
      const created = await create(userA, { date: '2026-10-01', weightKg: 80, bodyFatPct: 20 }).expect(201);
      const updated = await patch(userA, created.body.id, { weightKg: 79.5, bodyFatPct: null, date: '2026-10-02' }).expect(200);
      expect(updated.body).toMatchObject({ id: created.body.id, weightKg: 79.5, bodyFatPct: null, date: '2026-10-02' });
    });

    it('refuses to clear the last remaining value', async () => {
      const created = await create(userA, { date: '2026-10-03', weightKg: 80 }).expect(201);
      await patch(userA, created.body.id, { weightKg: null }).expect(400);
      expect((await patch(userA, created.body.id, { weightKg: null, notes: 'Skipped the scale' }).expect(200)).body).toMatchObject({ weightKg: null, notes: 'Skipped the scale' });
    });

    it('rejects out-of-range values', async () => {
      const created = await create(userA, { date: '2026-10-04', weightKg: 80 }).expect(201);
      await patch(userA, created.body.id, { weightKg: 0 }).expect(400);
      await patch(userA, created.body.id, { bodyFatPct: 150 }).expect(400);
      await patch(userA, created.body.id, { date: 'nope' }).expect(400);
    });

    it('deletes the metric, which then 404s', async () => {
      const created = await create(userA, { date: '2026-10-05', weightKg: 80 }).expect(201);
      await del(userA, created.body.id).expect(204);
      await del(userA, created.body.id).expect(404);
      await patch(userA, created.body.id, { weightKg: 81 }).expect(404);
    });

    it('is 404 for another user\'s metric, and 400 for an id that is not a UUID', async () => {
      const created = await create(userA, { date: '2026-10-06', weightKg: 80 }).expect(201);
      await patch(userB, created.body.id, { weightKg: 1 }).expect(404);
      await del(userB, created.body.id).expect(404);
      await patch(userA, 'not-a-uuid', { weightKg: 80 }).expect(400);
    });

    it('requires authentication for PATCH and DELETE', async () => {
      const created = await create(userA, { date: '2026-10-07', weightKg: 80 }).expect(201);
      await http().patch(`/api/v1/body-metrics/${created.body.id}`).send({ weightKg: 81 }).expect(401);
      await http().delete(`/api/v1/body-metrics/${created.body.id}`).expect(401);
    });
  });
});
