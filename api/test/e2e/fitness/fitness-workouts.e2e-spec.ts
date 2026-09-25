import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';
import { libraryExerciseId, minutesAgo } from './support.js';

describe('Fitness: workouts (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let userA: TestUser;
  let userB: TestUser;
  let squat: string;
  let bench: string;

  const create = (user: TestUser, body: Record<string, unknown>) => request(app.getHttpServer()).post('/api/v1/workouts').set(bearer(user.token)).send(body);
  const get = (user: TestUser, id: string) => request(app.getHttpServer()).get(`/api/v1/workouts/${id}`).set(bearer(user.token));
  const list = (user: TestUser, query: Record<string, string> = {}) => request(app.getHttpServer()).get('/api/v1/workouts').query(query).set(bearer(user.token));
  const patch = (user: TestUser, id: string, body: Record<string, unknown>) => request(app.getHttpServer()).patch(`/api/v1/workouts/${id}`).set(bearer(user.token)).send(body);
  const del = (user: TestUser, id: string) => request(app.getHttpServer()).delete(`/api/v1/workouts/${id}`).set(bearer(user.token));
  const complete = (user: TestUser, id: string, body: Record<string, unknown> = {}) =>
    request(app.getHttpServer()).post(`/api/v1/workouts/${id}/complete`).set(bearer(user.token)).send(body);

  const basic = (overrides: Record<string, unknown> = {}) => ({ workoutType: 'strength', startedAt: '2026-09-25T07:00:00Z', ...overrides });

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
    squat = await libraryExerciseId(app, userA.token, 'Barbell Back Squat');
    bench = await libraryExerciseId(app, userA.token, 'Bench Press');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('creating a workout', () => {
    it('creates a minimal workout with defaults', async () => {
      const res = await create(userA, basic()).expect(201);
      expect(res.body).toMatchObject({
        title: null,
        workoutType: 'strength',
        startedAt: '2026-09-25T07:00:00.000Z',
        completedAt: null,
        durationMinutes: null,
        notes: null,
        programId: null,
        source: 'manual',
        exercises: [],
      });
      expect(res.body.id).toEqual(expect.any(String));
      expect((await get(userA, res.body.id).expect(200)).body).toEqual(res.body);
    });

    it('creates a workout with nested exercises and sets, numbering by position', async () => {
      const res = await create(
        userA,
        basic({
          title: 'Push day',
          notes: 'Felt strong',
          exercises: [
            { exerciseId: bench, sets: [{ reps: 8, weightKg: 60, rpe: 7 }, { reps: 8, weightKg: 62.5, rpe: 8.5 }] },
            { exerciseId: squat, sets: [{ reps: 5, weightKg: 100 }] },
          ],
        }),
      ).expect(201);
      expect(res.body.title).toBe('Push day');
      expect(res.body.exercises.map((e: { name: string; sortOrder: number }) => [e.name, e.sortOrder])).toEqual([
        ['Bench Press', 0],
        ['Barbell Back Squat', 1],
      ]);
      expect(res.body.exercises[0].sets).toMatchObject([
        { setNumber: 1, reps: 8, weightKg: 60, rpe: 7 },
        { setNumber: 2, reps: 8, weightKg: 62.5, rpe: 8.5 },
      ]);
      expect(res.body.exercises[1].sets[0]).toMatchObject({ setNumber: 1, reps: 5, weightKg: 100, durationSeconds: null });
    });

    it('records cardio-style sets (duration and distance)', async () => {
      const running = await libraryExerciseId(app, userA.token, 'Running');
      const res = await create(userA, basic({ workoutType: 'run', exercises: [{ exerciseId: running, sets: [{ durationSeconds: 1800, distanceMeters: 5000 }] }] })).expect(201);
      expect(res.body.exercises[0].sets[0]).toMatchObject({ durationSeconds: 1800, distanceMeters: 5000, reps: null });
    });

    it('derives durationMinutes when created already completed', async () => {
      const res = await create(userA, basic({ completedAt: '2026-09-25T07:45:00Z' })).expect(201);
      expect(res.body).toMatchObject({ completedAt: '2026-09-25T07:45:00.000Z', durationMinutes: 45 });
    });

    it('accepts a client-supplied id, and rejects a repeat of it with 409', async () => {
      const id = randomUUID();
      const first = await create(userA, basic({ id })).expect(201);
      expect(first.body.id).toBe(id);
      const repeat = await create(userA, basic({ id })).expect(409);
      expect(repeat.body).toMatchObject({ statusCode: 409, error: 'CONFLICT' });
    });

    it('rejects a client-supplied id that collides with another user\'s workout', async () => {
      const id = randomUUID();
      await create(userA, basic({ id })).expect(201);
      await create(userB, basic({ id })).expect(409);
    });

    it.each([
      ['no workoutType', { workoutType: undefined }],
      ['an empty workoutType', { workoutType: '' }],
      ['no startedAt', { startedAt: undefined }],
      ['a bad startedAt', { startedAt: 'yesterday-ish' }],
      ['completedAt before startedAt', { completedAt: '2026-09-25T06:00:00Z' }],
      ['a bad source', { source: 'imported' }],
      ['durationMinutes of 0', { durationMinutes: 0 }],
      ['a non-UUID client id', { id: 'not-a-uuid' }],
      ['an unknown property', { extra: 'nope' }],
      ['a program that is not yours', { programId: randomUUID() }],
      ['an exercise that does not exist', { exercises: [{ exerciseId: randomUUID() }] }],
      ['a non-UUID exerciseId', { exercises: [{ exerciseId: 'squat' }] }],
      ['an rpe above 10', { exercises: [{ exerciseId: '00000000-0000-4000-8000-000000000000', sets: [{ rpe: 11 }] }] }],
      ['negative reps', { exercises: [{ exerciseId: '00000000-0000-4000-8000-000000000000', sets: [{ reps: -1 }] }] }],
    ])('rejects %s with a 400 and the standard error shape', async (_name, override) => {
      const res = await create(userA, basic(override)).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'BAD_REQUEST' });
      expect(res.body.message).toEqual(expect.any(String));
    });

    it('rejects two sets with the same setNumber in one exercise', async () => {
      await create(userA, basic({ exercises: [{ exerciseId: squat, sets: [{ setNumber: 1, reps: 5 }, { setNumber: 1, reps: 5 }] }] })).expect(400);
    });

    it('rejects using another user\'s custom exercise', async () => {
      const custom = await request(app.getHttpServer()).post('/api/v1/exercises').set(bearer(userB.token)).send({ name: `B only ${randomUUID()}`, category: 'strength' }).expect(201);
      await create(userA, basic({ exercises: [{ exerciseId: custom.body.id }] })).expect(400);
      await create(userB, basic({ exercises: [{ exerciseId: custom.body.id }] })).expect(201);
    });

    it('replays an Idempotency-Key instead of logging a second workout', async () => {
      const key = { 'Idempotency-Key': `create-${randomUUID()}` };
      const body = basic({ title: 'Once only' });
      const first = await request(app.getHttpServer()).post('/api/v1/workouts').set(bearer(userA.token)).set(key).send(body).expect(201);
      const replay = await request(app.getHttpServer()).post('/api/v1/workouts').set(bearer(userA.token)).set(key).send(body).expect(201);
      expect(replay.body).toEqual(first.body);
      const { body: page } = await list(userA, { limit: '100' }).expect(200);
      expect(page.items.filter((w: { title: string }) => w.title === 'Once only')).toHaveLength(1);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).post('/api/v1/workouts').send(basic()).expect(401);
    });
  });

  describe('reading a workout', () => {
    it('is 404 for another user\'s workout, exactly as for one that does not exist', async () => {
      const mine = await create(userA, basic()).expect(201);
      const stranger = await get(userB, mine.body.id).expect(404);
      const missing = await get(userB, '2a3b4c5d-0000-4000-8000-000000000000').expect(404);
      expect(stranger.body).toEqual(missing.body);
    });

    it('is 400 for an id that is not a UUID, and 401 without a session', async () => {
      await get(userA, 'not-a-uuid').expect(400);
      await request(app.getHttpServer()).get('/api/v1/workouts/2a3b4c5d-0000-4000-8000-000000000000').expect(401);
    });
  });

  describe('listing workouts', () => {
    it('lists newest first, and only the caller\'s own', async () => {
      const isolated = await signUpAndVerify(app, sentMails);
      const older = await create(isolated, basic({ title: 'Older', startedAt: '2027-01-01T07:00:00Z' })).expect(201);
      const newer = await create(isolated, basic({ title: 'Newer', startedAt: '2027-01-03T07:00:00Z' })).expect(201);
      const middle = await create(isolated, basic({ title: 'Middle', startedAt: '2027-01-02T07:00:00Z' })).expect(201);
      const { body } = await list(isolated, { limit: '100' }).expect(200);
      expect(body.items.map((w: { id: string }) => w.id)).toEqual([newer.body.id, middle.body.id, older.body.id]);
    });

    it('pages through results without skipping or repeating any', async () => {
      const isolated = await signUpAndVerify(app, sentMails);
      const created: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const res = await create(isolated, basic({ startedAt: `2027-02-0${i + 1}T07:00:00Z` })).expect(201);
        created.push(res.body.id);
      }
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let pages = 0; pages < 10; pages += 1) {
        const res = await list(isolated, { limit: '2', ...(cursor ? { cursor } : {}) }).expect(200);
        expect(res.body.items.length).toBeLessThanOrEqual(2);
        seen.push(...res.body.items.map((w: { id: string }) => w.id));
        cursor = res.body.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(new Set(seen)).toEqual(new Set(created));
      expect(seen).toHaveLength(created.length);
    });

    it('filters by from/to, workoutType and completed', async () => {
      const isolated = await signUpAndVerify(app, sentMails);
      const run = await create(isolated, basic({ workoutType: 'run', startedAt: '2027-03-01T07:00:00Z', completedAt: '2027-03-01T07:30:00Z' })).expect(201);
      const lift = await create(isolated, basic({ workoutType: 'strength', startedAt: '2027-03-10T07:00:00Z' })).expect(201);
      const ids = async (query: Record<string, string>) => (await list(isolated, { ...query, limit: '100' }).expect(200)).body.items.map((w: { id: string }) => w.id);

      expect(await ids({ from: '2027-03-05T00:00:00Z' })).toEqual([lift.body.id]);
      expect(await ids({ to: '2027-03-05T00:00:00Z' })).toEqual([run.body.id]);
      expect(await ids({ workoutType: 'RUN' })).toEqual([run.body.id]);
      expect(await ids({ completed: 'true' })).toEqual([run.body.id]);
      expect(await ids({ completed: 'false' })).toEqual([lift.body.id]);
    });

    it('rejects a bad limit, cursor or filter', async () => {
      for (const query of [{ limit: '0' }, { limit: '101' }, { cursor: 'nonsense' }, { from: 'not-a-date' }, { completed: 'maybe' }]) {
        await list(userA, query).expect(400);
      }
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/workouts').expect(401);
    });
  });

  describe('updating and deleting', () => {
    it('updates fields in place, and can null out an optional one', async () => {
      const created = await create(userA, basic({ title: 'Original', notes: 'n' })).expect(201);
      const updated = await patch(userA, created.body.id, { title: 'Renamed', workoutType: 'run', notes: null, durationMinutes: 50 }).expect(200);
      expect(updated.body).toMatchObject({ id: created.body.id, title: 'Renamed', workoutType: 'run', notes: null, durationMinutes: 50 });
    });

    it('replaces every exercise and set when exercises is sent', async () => {
      const created = await create(userA, basic({ exercises: [{ exerciseId: bench, sets: [{ reps: 8 }] }] })).expect(201);
      const updated = await patch(userA, created.body.id, { exercises: [{ exerciseId: squat, sets: [{ reps: 5 }, { reps: 5 }] }] }).expect(200);
      expect(updated.body.exercises).toHaveLength(1);
      expect(updated.body.exercises[0]).toMatchObject({ name: 'Barbell Back Squat' });
      expect(updated.body.exercises[0].sets).toHaveLength(2);

      const cleared = await patch(userA, created.body.id, { exercises: [] }).expect(200);
      expect(cleared.body.exercises).toEqual([]);
    });

    it('leaves exercises alone when they are not sent', async () => {
      const created = await create(userA, basic({ exercises: [{ exerciseId: bench, sets: [{ reps: 8 }] }] })).expect(201);
      const updated = await patch(userA, created.body.id, { title: 'Still has bench' }).expect(200);
      expect(updated.body.exercises).toHaveLength(1);
    });

    it('rejects moving startedAt after completedAt', async () => {
      const created = await create(userA, basic({ completedAt: '2026-09-25T07:45:00Z' })).expect(201);
      await patch(userA, created.body.id, { startedAt: '2026-09-25T09:00:00Z' }).expect(400);
    });

    it('is 404 for another user\'s workout', async () => {
      const created = await create(userA, basic()).expect(201);
      await patch(userB, created.body.id, { title: 'Hijacked' }).expect(404);
      await del(userB, created.body.id).expect(404);
    });

    it('deletes the workout, which then 404s and drops out of the list', async () => {
      const created = await create(userA, basic({ title: 'Doomed', startedAt: '2028-01-01T07:00:00Z' })).expect(201);
      await del(userA, created.body.id).expect(204);
      await get(userA, created.body.id).expect(404);
      await del(userA, created.body.id).expect(404);
      const { body } = await list(userA, { from: '2028-01-01T00:00:00Z', to: '2028-01-02T00:00:00Z' }).expect(200);
      expect(body.items).toEqual([]);
    });

    it('requires authentication for PATCH and DELETE', async () => {
      const created = await create(userA, basic()).expect(201);
      await request(app.getHttpServer()).patch(`/api/v1/workouts/${created.body.id}`).send({ title: 'x' }).expect(401);
      await request(app.getHttpServer()).delete(`/api/v1/workouts/${created.body.id}`).expect(401);
    });
  });

  describe('completing a workout', () => {
    it('sets completedAt and derives the duration from startedAt', async () => {
      const created = await create(userA, basic({ startedAt: minutesAgo(30) })).expect(201);
      const res = await complete(userA, created.body.id).expect(200);
      expect(res.body.completedAt).toEqual(expect.any(String));
      expect(res.body.durationMinutes).toBeGreaterThanOrEqual(29);
      expect(res.body.durationMinutes).toBeLessThanOrEqual(31);
    });

    it('takes an explicit completedAt and durationMinutes', async () => {
      const created = await create(userA, basic()).expect(201);
      const res = await complete(userA, created.body.id, { completedAt: '2026-09-25T08:10:00Z', durationMinutes: 55 }).expect(200);
      expect(res.body).toMatchObject({ completedAt: '2026-09-25T08:10:00.000Z', durationMinutes: 55 });
    });

    it('keeps a duration that was already recorded', async () => {
      const created = await create(userA, basic({ durationMinutes: 40 })).expect(201);
      const res = await complete(userA, created.body.id, { completedAt: '2026-09-25T09:00:00Z' }).expect(200);
      expect(res.body.durationMinutes).toBe(40);
    });

    it('is 409 once completed, and never moves completedAt', async () => {
      const created = await create(userA, basic()).expect(201);
      const first = await complete(userA, created.body.id, { completedAt: '2026-09-25T08:00:00Z' }).expect(200);
      const again = await complete(userA, created.body.id).expect(409);
      expect(again.body).toMatchObject({ statusCode: 409, error: 'CONFLICT' });
      expect((await get(userA, created.body.id).expect(200)).body.completedAt).toBe(first.body.completedAt);
    });

    it('rejects a completedAt before startedAt', async () => {
      const created = await create(userA, basic()).expect(201);
      await complete(userA, created.body.id, { completedAt: '2026-09-25T06:00:00Z' }).expect(400);
    });

    it('replays an Idempotency-Key instead of answering 409', async () => {
      const created = await create(userA, basic()).expect(201);
      const key = { 'Idempotency-Key': `complete-${created.body.id}` };
      const first = await request(app.getHttpServer()).post(`/api/v1/workouts/${created.body.id}/complete`).set(bearer(userA.token)).set(key).send({ completedAt: '2026-09-25T08:00:00Z' }).expect(200);
      const replay = await request(app.getHttpServer()).post(`/api/v1/workouts/${created.body.id}/complete`).set(bearer(userA.token)).set(key).send({ completedAt: '2026-09-25T08:00:00Z' }).expect(200);
      expect(replay.body).toEqual(first.body);
    });

    it('is 404 for another user\'s workout, and 401 without a session', async () => {
      const created = await create(userA, basic()).expect(201);
      await complete(userB, created.body.id).expect(404);
      await request(app.getHttpServer()).post(`/api/v1/workouts/${created.body.id}/complete`).send({}).expect(401);
    });
  });
});
