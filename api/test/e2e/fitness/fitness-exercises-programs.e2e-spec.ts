import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';
import { libraryExerciseId } from './support.js';

describe('Fitness: exercises and programs (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let userA: TestUser;
  let userB: TestUser;
  let squat: string;
  let bench: string;

  const http = () => request(app.getHttpServer());
  const listExercises = (user: TestUser, query: Record<string, string> = {}) => http().get('/api/v1/exercises').query(query).set(bearer(user.token));
  const createExercise = (user: TestUser, body: Record<string, unknown>) => http().post('/api/v1/exercises').set(bearer(user.token)).send(body);
  const createProgram = (user: TestUser, body: Record<string, unknown>) => http().post('/api/v1/programs').set(bearer(user.token)).send(body);
  const getProgram = (user: TestUser, id: string) => http().get(`/api/v1/programs/${id}`).set(bearer(user.token));
  const listPrograms = (user: TestUser, query: Record<string, string> = {}) => http().get('/api/v1/programs').query(query).set(bearer(user.token));
  const patchProgram = (user: TestUser, id: string, body: Record<string, unknown>) => http().patch(`/api/v1/programs/${id}`).set(bearer(user.token)).send(body);
  const delProgram = (user: TestUser, id: string) => http().delete(`/api/v1/programs/${id}`).set(bearer(user.token));
  const activate = (user: TestUser, id: string) => http().post(`/api/v1/programs/${id}/activate`).set(bearer(user.token)).send({});

  const session = (dayOffset: number, overrides: Record<string, unknown> = {}) => ({
    dayOffset,
    workoutTemplate: { workoutType: 'strength', title: `Day ${dayOffset}`, durationMinutes: 60, exercises: [{ exerciseId: squat, sets: [{ reps: 5, weightKg: 100 }] }], ...overrides },
  });

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

  describe('exercises', () => {
    it('lists the seeded library by name', async () => {
      const { body } = await listExercises(userA, { limit: '100' }).expect(200);
      expect(body.items.length).toBeGreaterThanOrEqual(40);
      // Ordered by the database's collation (which treats spaces its own way), so only the first letters are compared here.
      const initials = body.items.map((e: { name: string }) => e.name[0].toUpperCase());
      expect(initials).toEqual([...initials].sort((a: string, b: string) => a.localeCompare(b)));
      expect(body.items.every((e: { isCustom: boolean }) => e.isCustom === false)).toBe(true);
      expect(body.items[0]).toEqual({ id: expect.any(String), name: expect.any(String), category: expect.any(String), muscleGroups: expect.any(Array), isCustom: false });
    });

    it('pages through the whole library without skipping or repeating any', async () => {
      const all = (await listExercises(userA, { limit: '100' }).expect(200)).body.items.map((e: { id: string }) => e.id);
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let pages = 0; pages < 20; pages += 1) {
        const res = await listExercises(userA, { limit: '7', ...(cursor ? { cursor } : {}) }).expect(200);
        seen.push(...res.body.items.map((e: { id: string }) => e.id));
        cursor = res.body.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(seen).toEqual(all);
    });

    it('filters by category, muscleGroup and a case-insensitive name search', async () => {
      const cardio = await listExercises(userA, { category: 'cardio', limit: '100' }).expect(200);
      expect(cardio.body.items.length).toBeGreaterThan(0);
      expect(cardio.body.items.every((e: { category: string }) => e.category === 'cardio')).toBe(true);

      const chest = await listExercises(userA, { muscleGroup: 'chest', limit: '100' }).expect(200);
      expect(chest.body.items.every((e: { muscleGroups: string[] }) => e.muscleGroups.includes('chest'))).toBe(true);
      expect(chest.body.items.map((e: { name: string }) => e.name)).toContain('Bench Press');

      const squats = await listExercises(userA, { q: 'SQUAT', limit: '100' }).expect(200);
      expect(squats.body.items.map((e: { name: string }) => e.name)).toEqual(expect.arrayContaining(['Barbell Back Squat', 'Goblet Squat']));
    });

    it('adds a custom exercise, visible to its owner only', async () => {
      const name = `Landmine Press ${randomUUID()}`;
      const created = await createExercise(userA, { name, category: 'strength', muscleGroups: ['shoulders', 'chest', 'shoulders'] }).expect(201);
      expect(created.body).toMatchObject({ name, category: 'strength', muscleGroups: ['shoulders', 'chest'], isCustom: true });

      const mine = await listExercises(userA, { isCustom: 'true', limit: '100' }).expect(200);
      expect(mine.body.items.map((e: { id: string }) => e.id)).toContain(created.body.id);
      const library = await listExercises(userA, { isCustom: 'false', q: name, limit: '100' }).expect(200);
      expect(library.body.items).toEqual([]);
      const theirs = await listExercises(userB, { q: name, limit: '100' }).expect(200);
      expect(theirs.body.items).toEqual([]);
    });

    it('rejects a duplicate custom name for the same user with 409, but not for another user', async () => {
      const name = `Duplicate ${randomUUID()}`;
      await createExercise(userA, { name, category: 'other' }).expect(201);
      const repeat = await createExercise(userA, { name, category: 'other' }).expect(409);
      expect(repeat.body).toMatchObject({ statusCode: 409, error: 'CONFLICT' });
      await createExercise(userB, { name, category: 'other' }).expect(201);
    });

    it.each([
      ['no name', { category: 'strength' }],
      ['an empty name', { name: '', category: 'strength' }],
      ['no category', { name: 'x' }],
      ['a bad category', { name: 'x', category: 'magic' }],
      ['a bad muscle group', { name: 'x', category: 'strength', muscleGroups: ['pinky'] }],
      ['an unknown property', { name: 'x', category: 'strength', extra: 1 }],
    ])('rejects %s with a 400', async (_name, body) => {
      const res = await createExercise(userA, body).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'BAD_REQUEST' });
    });

    it('replays an Idempotency-Key instead of answering 409', async () => {
      const key = { 'Idempotency-Key': `exercise-${randomUUID()}` };
      const body = { name: `Keyed ${randomUUID()}`, category: 'mobility' };
      const first = await http().post('/api/v1/exercises').set(bearer(userA.token)).set(key).send(body).expect(201);
      const replay = await http().post('/api/v1/exercises').set(bearer(userA.token)).set(key).send(body).expect(201);
      expect(replay.body).toEqual(first.body);
    });

    it('rejects a bad limit, cursor, category or muscle group', async () => {
      for (const query of [{ limit: '0' }, { limit: '101' }, { cursor: 'nonsense' }, { category: 'magic' }, { muscleGroup: 'pinky' }]) {
        await listExercises(userA, query).expect(400);
      }
    });

    it('requires authentication', async () => {
      await http().get('/api/v1/exercises').expect(401);
      await http().post('/api/v1/exercises').send({ name: 'x', category: 'other' }).expect(401);
    });
  });

  describe('programs', () => {
    it('creates a program with planned sessions, inactive until activated', async () => {
      const res = await createProgram(userA, { name: '12-week strength', description: 'Linear progression', workouts: [session(2), session(0)] }).expect(201);
      expect(res.body).toMatchObject({ name: '12-week strength', description: 'Linear progression', isActive: false, activatedAt: null });
      expect(res.body.workouts.map((w: { dayOffset: number }) => w.dayOffset)).toEqual([0, 2]);
      expect(res.body.workouts[0].workoutTemplate).toMatchObject({ workoutType: 'strength', title: 'Day 0', durationMinutes: 60 });
      expect((await getProgram(userA, res.body.id).expect(200)).body).toEqual(res.body);
    });

    it('creates an empty program with just a name', async () => {
      const res = await createProgram(userA, { name: 'Blank' }).expect(201);
      expect(res.body.workouts).toEqual([]);
    });

    it.each([
      ['no name', { workouts: [] }],
      ['an unknown property', { name: 'x', extra: 1 }],
      ['a negative dayOffset', { name: 'x', workouts: [{ dayOffset: -1, workoutTemplate: { workoutType: 'run' } }] }],
      ['a template with no workoutType', { name: 'x', workouts: [{ dayOffset: 0, workoutTemplate: { title: 'x' } }] }],
      ['a template with an unknown key', { name: 'x', workouts: [{ dayOffset: 0, workoutTemplate: { workoutType: 'run', mood: 'great' } }] }],
      ['a template with a bad set', { name: 'x', workouts: [{ dayOffset: 0, workoutTemplate: { workoutType: 'run', exercises: [{ exerciseId: randomUUID(), sets: [{ rpe: 12 }] }] } }] }],
      ['a template exercise that does not exist', { name: 'x', workouts: [{ dayOffset: 0, workoutTemplate: { workoutType: 'run', exercises: [{ exerciseId: randomUUID() }] } }] }],
      ['a template that is not an object', { name: 'x', workouts: [{ dayOffset: 0, workoutTemplate: 'run' }] }],
    ])('rejects %s with a 400', async (_name, body) => {
      const res = await createProgram(userA, body).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'BAD_REQUEST' });
    });

    it('updates name/description, and replaces the sessions only when sent', async () => {
      const created = await createProgram(userA, { name: 'Original', workouts: [session(0), session(1)] }).expect(201);
      const renamed = await patchProgram(userA, created.body.id, { name: 'Renamed', description: null }).expect(200);
      expect(renamed.body).toMatchObject({ name: 'Renamed', description: null });
      expect(renamed.body.workouts).toHaveLength(2);

      const replaced = await patchProgram(userA, created.body.id, { workouts: [{ dayOffset: 5, workoutTemplate: { workoutType: 'run', exercises: [{ exerciseId: bench }] } }] }).expect(200);
      expect(replaced.body.workouts.map((w: { dayOffset: number }) => w.dayOffset)).toEqual([5]);
      await patchProgram(userA, created.body.id, { workouts: [{ dayOffset: 0, workoutTemplate: { nope: true } }] }).expect(400);
      expect((await getProgram(userA, created.body.id).expect(200)).body.workouts).toHaveLength(1); // the bad replace changed nothing
    });

    it('activates one program at a time, deactivating the previous one', async () => {
      const first = await createProgram(userA, { name: 'First' }).expect(201);
      const second = await createProgram(userA, { name: 'Second' }).expect(201);

      const a = await activate(userA, first.body.id).expect(200);
      expect(a.body).toMatchObject({ isActive: true, activatedAt: expect.any(String) });
      const b = await activate(userA, second.body.id).expect(200);
      expect(b.body.isActive).toBe(true);
      expect((await getProgram(userA, first.body.id).expect(200)).body.isActive).toBe(false);

      const active = await listPrograms(userA, { isActive: 'true' }).expect(200);
      expect(active.body.items.map((p: { id: string }) => p.id)).toEqual([second.body.id]);
    });

    it('activating an already-active program is a no-op that keeps its day zero', async () => {
      const program = await createProgram(userA, { name: 'Steady' }).expect(201);
      const first = await activate(userA, program.body.id).expect(200);
      const again = await activate(userA, program.body.id).expect(200);
      expect(again.body.activatedAt).toBe(first.body.activatedAt);
    });

    it('activating one user\'s program leaves another user\'s active program alone', async () => {
      const mine = await createProgram(userA, { name: 'Mine' }).expect(201);
      const theirs = await createProgram(userB, { name: 'Theirs' }).expect(201);
      await activate(userB, theirs.body.id).expect(200);
      await activate(userA, mine.body.id).expect(200);
      expect((await getProgram(userB, theirs.body.id).expect(200)).body.isActive).toBe(true);
    });

    it('lists newest first, paginated, and only the caller\'s own', async () => {
      const isolated = await signUpAndVerify(app, sentMails);
      const p1 = await createProgram(isolated, { name: 'P1' }).expect(201);
      const p2 = await createProgram(isolated, { name: 'P2' }).expect(201);
      const p3 = await createProgram(isolated, { name: 'P3' }).expect(201);

      const seen: string[] = [];
      let cursor: string | undefined;
      for (let pages = 0; pages < 5; pages += 1) {
        const res = await listPrograms(isolated, { limit: '2', ...(cursor ? { cursor } : {}) }).expect(200);
        seen.push(...res.body.items.map((p: { id: string }) => p.id));
        cursor = res.body.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(seen).toEqual([p3.body.id, p2.body.id, p1.body.id]);
    });

    it('deleting a program keeps the workouts logged against it, unlinked', async () => {
      const program = await createProgram(userA, { name: 'Doomed', workouts: [session(0)] }).expect(201);
      const workout = await http().post('/api/v1/workouts').set(bearer(userA.token)).send({ workoutType: 'strength', startedAt: '2026-09-25T07:00:00Z', programId: program.body.id }).expect(201);
      expect(workout.body.programId).toBe(program.body.id);

      await delProgram(userA, program.body.id).expect(204);
      await getProgram(userA, program.body.id).expect(404);
      const after = await http().get(`/api/v1/workouts/${workout.body.id}`).set(bearer(userA.token)).expect(200);
      expect(after.body.programId).toBeNull();
    });

    it('is 404 for another user\'s program on every route', async () => {
      const program = await createProgram(userA, { name: 'Private' }).expect(201);
      await getProgram(userB, program.body.id).expect(404);
      await patchProgram(userB, program.body.id, { name: 'Hijacked' }).expect(404);
      await delProgram(userB, program.body.id).expect(404);
      await activate(userB, program.body.id).expect(404);
      expect((await listPrograms(userB, { limit: '100' }).expect(200)).body.items.map((p: { id: string }) => p.id)).not.toContain(program.body.id);
    });

    it('is 400 for an id that is not a UUID, and needs a session everywhere', async () => {
      await getProgram(userA, 'not-a-uuid').expect(400);
      const program = await createProgram(userA, { name: 'Auth' }).expect(201);
      await http().get('/api/v1/programs').expect(401);
      await http().post('/api/v1/programs').send({ name: 'x' }).expect(401);
      await http().get(`/api/v1/programs/${program.body.id}`).expect(401);
      await http().patch(`/api/v1/programs/${program.body.id}`).send({}).expect(401);
      await http().delete(`/api/v1/programs/${program.body.id}`).expect(401);
      await http().post(`/api/v1/programs/${program.body.id}/activate`).send({}).expect(401);
    });

    it('replays an Idempotency-Key instead of creating a second program', async () => {
      const key = { 'Idempotency-Key': `program-${randomUUID()}` };
      const first = await http().post('/api/v1/programs').set(bearer(userA.token)).set(key).send({ name: 'Once' }).expect(201);
      const replay = await http().post('/api/v1/programs').set(bearer(userA.token)).set(key).send({ name: 'Once' }).expect(201);
      expect(replay.body).toEqual(first.body);
    });
  });
});
