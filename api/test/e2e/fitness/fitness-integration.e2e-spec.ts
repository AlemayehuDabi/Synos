import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FitnessTombstoneRetentionCron } from '../../../src/fitness/fitness-tombstone-retention.cron.js';
import { PrismaService } from '../../../src/lib/prisma.js';
import { ReviewGenerationService } from '../../../src/reviews/review-generation.service.js';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser, waitForExportReady } from '../helpers.js';
import { libraryExerciseId } from './support.js';

// Better Auth's sign-up rate limit stays on for these specs (see helpers.ts): five users, shared across the tests.
describe('Fitness: Today/Review/Calendar integration, privacy, export, deletion and retention (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let prisma: PrismaService;
  let userA: TestUser;
  let userB: TestUser;
  let squat: string;

  const http = () => request(app.getHttpServer());
  const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000);
  const createWorkout = (u: TestUser, body: Record<string, unknown>) => http().post('/api/v1/workouts').set(bearer(u.token)).send(body).expect(201);
  const todaySection = async (u: TestUser, query: Record<string, string> = {}) => {
    const res = await http().get('/api/v1/today').query(query).set(bearer(u.token)).expect(200);
    return res.body.sections.find((s: { domain: string }) => s.domain === 'fitness') as { status: string; summary: Record<string, number>; items: Record<string, unknown>[] };
  };
  const calendarBlocks = async (u: TestUser, from: string, to: string) => {
    const res = await http().get('/api/v1/calendar/view').query({ from, to }).set(bearer(u.token)).expect(200);
    return {
      status: res.body.contributors.find((c: { domain: string }) => c.domain === 'fitness').status as string,
      blocks: res.body.items.filter((i: { kind: string; domain?: string }) => i.kind === 'block' && i.domain === 'fitness') as Record<string, unknown>[],
    };
  };

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    prisma = app.get(PrismaService);
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
    squat = await libraryExerciseId(app, userA.token, 'Barbell Back Squat');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Today', () => {
    let program: { id: string };

    it('is an empty, healthy section for someone with no fitness data', async () => {
      expect(await todaySection(userB)).toEqual({ domain: 'fitness', status: 'ok', summary: { completed: 0, inProgress: 0, planned: 0, totalMinutes: 0 }, items: [] });
    });

    it('lists today\'s completed and in-progress workouts, and what the active program planned', async () => {
      const done = await createWorkout(userA, { workoutType: 'run', title: 'Morning run', startedAt: secondsAgo(2_000).toISOString(), completedAt: secondsAgo(5).toISOString(), durationMinutes: 30 });
      const open = await createWorkout(userA, { workoutType: 'yoga', startedAt: secondsAgo(1).toISOString() });
      const deleted = await createWorkout(userA, { workoutType: 'swim', startedAt: secondsAgo(1).toISOString() });
      await http().delete(`/api/v1/workouts/${deleted.body.id}`).set(bearer(userA.token)).expect(204);
      const created = await http()
        .post('/api/v1/programs')
        .set(bearer(userA.token))
        .send({
          name: 'Strength block',
          workouts: [
            { dayOffset: 0, workoutTemplate: { workoutType: 'strength', title: 'Leg day', durationMinutes: 60, exercises: [{ exerciseId: squat, sets: [{ reps: 5, weightKg: 100 }] }] } },
            { dayOffset: 3, workoutTemplate: { workoutType: 'strength', title: 'Upper day' } },
          ],
        })
        .expect(201);
      program = created.body;
      await http().post(`/api/v1/programs/${program.id}/activate`).set(bearer(userA.token)).send({}).expect(200);

      const section = await todaySection(userA);
      expect(section.status).toBe('ok');
      expect(section.summary).toEqual({ completed: 1, inProgress: 1, planned: 1, totalMinutes: 30 });
      expect(section.items.map((i) => [i.kind, i.title])).toEqual([
        ['completed', 'Morning run'],
        ['in_progress', 'Yoga'],
        ['planned', 'Leg day'],
      ]);
      expect(section.items[0]).toMatchObject({ id: done.body.id, workoutType: 'run', durationMinutes: 30 });
      expect(section.items[1]).toMatchObject({ id: open.body.id, completedAt: null });
      expect(section.items[2]).toMatchObject({ workoutType: 'strength', durationMinutes: 60, programId: program.id });
      expect(section.items.some((i) => i.id === deleted.body.id)).toBe(false);
    });

    it('stops planning a session once a workout from the program was completed today', async () => {
      const workout = await createWorkout(userA, { workoutType: 'strength', title: 'Leg day', programId: program.id, startedAt: secondsAgo(3).toISOString() });
      await http().post(`/api/v1/workouts/${workout.body.id}/complete`).set(bearer(userA.token)).send({ durationMinutes: 50 }).expect(200);
      const section = await todaySection(userA);
      expect(section.summary).toMatchObject({ completed: 2, planned: 0, totalMinutes: 80 });
      expect(section.items.some((i) => i.kind === 'planned')).toBe(false);
    });

    it('answers for another date on request: the program\'s day 3 is planned three days out', async () => {
      const inThreeDays = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
      const section = await todaySection(userA, { date: inThreeDays });
      expect(section.summary).toEqual({ completed: 0, inProgress: 0, planned: 1, totalMinutes: 0 });
      expect(section.items[0]).toMatchObject({ kind: 'planned', title: 'Upper day' });
    });

    it('never shows one user another\'s workouts or plan', async () => {
      const section = await todaySection(userB);
      expect(section.summary).toEqual({ completed: 0, inProgress: 0, planned: 0, totalMinutes: 0 });
    });
  });

  describe('Weekly review', () => {
    it('summarises the week\'s completed workouts and the body-metric trend, ignoring deleted ones and other weeks', async () => {
      // Week of Monday 2026-01-05 to Sunday 2026-01-11, safely in the past.
      const workout = (completedAt: string, minutes: number, deletedAt: Date | null = null) =>
        prisma.workout.create({
          data: { userId: userB.userId, workoutType: 'strength', startedAt: new Date(new Date(completedAt).getTime() - minutes * 60_000), completedAt: new Date(completedAt), durationMinutes: minutes, source: 'manual', deletedAt },
        });
      await workout('2026-01-06T08:00:00Z', 60);
      await workout('2026-01-08T18:00:00Z', 45);
      await workout('2026-01-07T09:00:00Z', 500, new Date()); // deleted
      await workout('2026-01-12T08:00:00Z', 90); // the following week
      const metric = (date: string, weightKg: number | null, bodyFatPct: number | null) =>
        prisma.bodyMetric.create({ data: { userId: userB.userId, date: new Date(`${date}T00:00:00Z`), weightKg, bodyFatPct, source: 'manual' } });
      await metric('2026-01-05', 82, 20);
      await metric('2026-01-08', 81, null);
      await metric('2026-01-11', 80.5, 19.5);
      await metric('2026-01-12', 70, null); // the following week

      await app.get(ReviewGenerationService).generateForUser(userB.userId, new Date('2026-01-12T02:30:00Z'));

      const res = await http().get('/api/v1/reviews').query({ type: 'weekly', limit: '5' }).set(bearer(userB.token)).expect(200);
      const review = res.body.items.find((r: { periodStart: string }) => r.periodStart === '2026-01-05');
      expect(review).toBeTruthy();
      const section = review.sections.find((s: { domain: string }) => s.domain === 'fitness');
      expect(section).toMatchObject({
        status: 'ok',
        metrics: { workoutsCompleted: 2, totalDurationMinutes: 105, avgWorkoutMinutes: 53, weightStartKg: 82, weightEndKg: 80.5, weightChangeKg: -1.5, bodyFatChangePct: -0.5 },
      });
      expect(section.highlights).toEqual(['Completed 2 workouts (105 min)', 'Weight down 1.5 kg', 'Body fat down 0.5%']);
    });
  });

  describe('Calendar blocks and privacy', () => {
    let workoutId: string;

    it('shows workouts as busy blocks from start to completion, and private is the default', async () => {
      const privacy = await http().get('/api/v1/me/privacy').set(bearer(userA.token)).expect(200);
      expect(privacy.body.fitness).toBe('private');

      const startedAt = new Date('2026-11-10T07:00:00Z');
      const workout = await createWorkout(userA, { workoutType: 'run', title: 'Tempo intervals', startedAt: startedAt.toISOString(), completedAt: '2026-11-10T07:50:00Z' });
      workoutId = workout.body.id;

      const { status, blocks } = await calendarBlocks(userA, '2026-11-10', '2026-11-10');
      expect(status).toBe('ok');
      expect(blocks).toHaveLength(1);
      // Private: the time is marked busy, but nothing about the workout leaves Fitness.
      expect(blocks[0]).toMatchObject({ id: workoutId, title: 'Workout', startsAt: '2026-11-10T07:00:00.000Z', endsAt: '2026-11-10T07:50:00.000Z', allDay: false, busy: true });
      expect(blocks[0]).not.toHaveProperty('ref');
      expect(JSON.stringify(blocks[0])).not.toContain('Tempo intervals');
      expect(JSON.stringify(blocks[0])).not.toContain('run');
    });

    it('reveals the workout\'s own title and a link back once the user shares fitness', async () => {
      await http().patch('/api/v1/me/privacy').set(bearer(userA.token)).send({ fitness: 'shared' }).expect(200);
      const { blocks } = await calendarBlocks(userA, '2026-11-10', '2026-11-10');
      expect(blocks[0]).toMatchObject({ id: workoutId, title: 'Tempo intervals', ref: { workoutId }, busy: true });

      await http().patch('/api/v1/me/privacy').set(bearer(userA.token)).send({ fitness: 'private' }).expect(200);
      expect((await calendarBlocks(userA, '2026-11-10', '2026-11-10')).blocks[0]).toMatchObject({ title: 'Workout' });
    });

    it('uses the recorded duration for an unfinished workout, skips one with no known end, and skips deleted ones', async () => {
      const timed = await createWorkout(userA, { workoutType: 'cycling', startedAt: '2026-11-11T09:00:00Z', durationMinutes: 90 });
      await createWorkout(userA, { workoutType: 'yoga', startedAt: '2026-11-11T12:00:00Z' });
      const deleted = await createWorkout(userA, { workoutType: 'swim', startedAt: '2026-11-11T15:00:00Z', completedAt: '2026-11-11T15:30:00Z' });
      await http().delete(`/api/v1/workouts/${deleted.body.id}`).set(bearer(userA.token)).expect(204);

      const { blocks } = await calendarBlocks(userA, '2026-11-11', '2026-11-11');
      expect(blocks.map((b) => b.id)).toEqual([timed.body.id]);
      expect(blocks[0]).toMatchObject({ startsAt: '2026-11-11T09:00:00.000Z', endsAt: '2026-11-11T10:30:00.000Z' });
    });

    it('includes a workout that started the evening before and runs into the requested day', async () => {
      await createWorkout(userA, { workoutType: 'run', startedAt: '2026-11-12T23:30:00Z', completedAt: '2026-11-13T00:30:00Z' });
      const { blocks } = await calendarBlocks(userA, '2026-11-13', '2026-11-13');
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({ startsAt: '2026-11-12T23:30:00.000Z', endsAt: '2026-11-13T00:30:00.000Z' });
    });

    it('never shows one user\'s workouts on another\'s calendar', async () => {
      const { status, blocks } = await calendarBlocks(userB, '2026-11-10', '2026-11-13');
      expect(status).toBe('ok');
      expect(blocks).toEqual([]);
    });
  });

  describe('Cross-user isolation', () => {
    it('keeps every one of the owner\'s resources out of another user\'s reads and writes', async () => {
      const workout = await createWorkout(userA, { workoutType: 'strength', startedAt: secondsAgo(60).toISOString() });
      const exercise = await http().post('/api/v1/exercises').set(bearer(userA.token)).send({ name: `Private lift ${randomUUID()}`, category: 'strength', muscleGroups: ['chest'] }).expect(201);
      const program = await http().post('/api/v1/programs').set(bearer(userA.token)).send({ name: `Private plan ${randomUUID()}` }).expect(201);
      const metric = await http().post('/api/v1/body-metrics').set(bearer(userA.token)).send({ weightKg: 99.9, date: '2026-08-01' }).expect(201);

      const listed = async (path: string, query: Record<string, string> = {}) =>
        JSON.stringify((await http().get(path).query({ limit: '100', ...query }).set(bearer(userB.token)).expect(200)).body);
      expect(await listed('/api/v1/workouts')).not.toContain(workout.body.id);
      expect(await listed('/api/v1/exercises')).not.toContain(exercise.body.id);
      expect(await listed('/api/v1/programs')).not.toContain(program.body.id);
      expect(await listed('/api/v1/body-metrics')).not.toContain(metric.body.id);

      // The library's exercises are shared; a custom one is its author's alone.
      await http().get(`/api/v1/workouts/${workout.body.id}`).set(bearer(userB.token)).expect(404);
      await http().get(`/api/v1/programs/${program.body.id}`).set(bearer(userB.token)).expect(404);
      await http().post(`/api/v1/workouts/${workout.body.id}/complete`).set(bearer(userB.token)).send({}).expect(404);
      await http().post(`/api/v1/programs/${program.body.id}/activate`).set(bearer(userB.token)).send({}).expect(404);
      await http().post('/api/v1/workouts').set(bearer(userB.token)).send({ workoutType: 'strength', startedAt: secondsAgo(30).toISOString(), exercises: [{ exerciseId: exercise.body.id }] }).expect(400);
      await http().post('/api/v1/workouts').set(bearer(userB.token)).send({ workoutType: 'strength', startedAt: secondsAgo(30).toISOString(), programId: program.body.id }).expect(400);

      // ... and nothing of the owner's was disturbed by those attempts.
      expect((await http().get(`/api/v1/workouts/${workout.body.id}`).set(bearer(userA.token)).expect(200)).body.completedAt).toBeNull();
      expect((await http().get(`/api/v1/programs/${program.body.id}`).set(bearer(userA.token)).expect(200)).body.isActive).toBe(false);
    });
  });

  describe('Export', () => {
    it('includes every fitness table for the exporting user, and nothing of anyone else\'s', async () => {
      const workout = await createWorkout(userA, {
        workoutType: 'strength',
        title: 'Exported workout',
        startedAt: '2026-10-01T07:00:00Z',
        exercises: [{ exerciseId: squat, sets: [{ reps: 5, weightKg: 100 }] }],
      });
      const exercise = await http().post('/api/v1/exercises').set(bearer(userA.token)).send({ name: `Exported lift ${randomUUID()}`, category: 'strength', muscleGroups: ['back'] }).expect(201);
      const program = await http().post('/api/v1/programs').set(bearer(userA.token)).send({ name: 'Exported program', workouts: [{ dayOffset: 1, workoutTemplate: { workoutType: 'run' } }] }).expect(201);
      const metric = await http().post('/api/v1/body-metrics').set(bearer(userA.token)).send({ date: '2026-10-01', weightKg: 77 }).expect(201);
      const dedupeKey = `export-${randomUUID()}`;
      await http()
        .post('/api/v1/wearables/samples')
        .set(bearer(userA.token))
        .send({ samples: [{ type: 'steps', startsAt: '2026-10-01T08:00:00Z', endsAt: '2026-10-01T09:00:00Z', value: { count: 500 }, sourceDevice: 'Test Watch', dedupeKey }] })
        .expect(200);
      await http().post('/api/v1/body-metrics').set(bearer(userB.token)).send({ date: '2026-10-01', weightKg: 55.5 }).expect(201);
      await createWorkout(userB, { workoutType: 'run', title: 'Not exported', startedAt: '2026-10-01T07:00:00Z' });

      const job = await http().post('/api/v1/me/export').set(bearer(userA.token)).expect(201);
      const data = JSON.parse((await waitForExportReady(app, userA.token, job.body.id)).text);
      const ids = (key: string) => (data[key] as { id: string }[]).map((row) => row.id);

      expect(ids('workouts')).toContain(workout.body.id);
      expect(ids('workoutExercises')).toContain(workout.body.exercises[0].id);
      expect(ids('workoutSets')).toContain(workout.body.exercises[0].sets[0].id);
      expect(ids('exercises')).toContain(exercise.body.id);
      expect(ids('programs')).toContain(program.body.id);
      expect(ids('programWorkouts')).toContain(program.body.workouts[0].id);
      expect(ids('bodyMetrics')).toContain(metric.body.id);
      expect((data.wearableSamples as { dedupeKey: string }[]).map((s) => s.dedupeKey)).toContain(dedupeKey);

      // Only the user's own rows: no library exercises, and nothing from userB.
      expect(data.exercises.every((e: { userId: string }) => e.userId === userA.userId)).toBe(true);
      for (const key of ['workouts', 'programs', 'bodyMetrics', 'wearableSamples']) {
        expect(data[key].every((row: { userId: string }) => row.userId === userA.userId), key).toBe(true);
      }
      expect(JSON.stringify(data)).not.toContain('Not exported');
    });
  });

  describe('Account deletion', () => {
    it('cascades every fitness table away with the account, leaving the shared library and other users alone', async () => {
      const doomed = await signUpAndVerify(app, sentMails);
      const custom = await http().post('/api/v1/exercises').set(bearer(doomed.token)).send({ name: `Doomed lift ${randomUUID()}`, category: 'strength', muscleGroups: ['quads'] }).expect(201);
      const workout = await createWorkout(doomed, {
        workoutType: 'strength',
        startedAt: '2026-10-02T07:00:00Z',
        exercises: [{ exerciseId: custom.body.id, sets: [{ reps: 5 }] }, { exerciseId: squat, sets: [{ reps: 3, weightKg: 120 }] }],
      });
      const program = await http().post('/api/v1/programs').set(bearer(doomed.token)).send({ name: 'Doomed program', workouts: [{ dayOffset: 0, workoutTemplate: { workoutType: 'run' } }] }).expect(201);
      await http().post('/api/v1/body-metrics').set(bearer(doomed.token)).send({ date: '2026-10-02', weightKg: 60 }).expect(201);
      await http()
        .post('/api/v1/wearables/samples')
        .set(bearer(doomed.token))
        .send({ samples: [{ type: 'workout', startsAt: '2026-10-02T07:00:00Z', endsAt: '2026-10-02T08:00:00Z', value: { workoutType: 'cycling' }, sourceDevice: 'Test Watch', dedupeKey: `doomed-${randomUUID()}` }] })
        .expect(200);

      const libraryBefore = await prisma.exercise.count({ where: { userId: null } });
      const bystanderBefore = {
        workouts: await prisma.workout.count({ where: { userId: userA.userId } }),
        metrics: await prisma.bodyMetric.count({ where: { userId: userA.userId } }),
        exercises: await prisma.exercise.count({ where: { userId: userA.userId } }),
      };

      await http().delete('/api/v1/me').set(bearer(doomed.token)).send({ password: doomed.password }).expect(204);

      const mine = { userId: doomed.userId };
      expect(await prisma.workout.count({ where: mine })).toBe(0);
      expect(await prisma.workoutExercise.count({ where: { workoutId: workout.body.id } })).toBe(0);
      expect(await prisma.workoutSet.count({ where: { workoutExercise: { workoutId: workout.body.id } } })).toBe(0);
      expect(await prisma.exercise.count({ where: mine })).toBe(0);
      expect(await prisma.program.count({ where: mine })).toBe(0);
      expect(await prisma.programWorkout.count({ where: { programId: program.body.id } })).toBe(0);
      expect(await prisma.bodyMetric.count({ where: mine })).toBe(0);
      expect(await prisma.wearableSample.count({ where: mine })).toBe(0);

      expect(await prisma.exercise.count({ where: { userId: null } })).toBe(libraryBefore);
      expect({
        workouts: await prisma.workout.count({ where: { userId: userA.userId } }),
        metrics: await prisma.bodyMetric.count({ where: { userId: userA.userId } }),
        exercises: await prisma.exercise.count({ where: { userId: userA.userId } }),
      }).toEqual(bystanderBefore);
    });
  });

  describe('Exercises in use', () => {
    it('cannot be deleted out from under a workout, even though account deletion may remove them together', async () => {
      const exercise = await http().post('/api/v1/exercises').set(bearer(userA.token)).send({ name: `In use ${randomUUID()}`, category: 'strength', muscleGroups: ['core'] }).expect(201);
      const workout = await createWorkout(userA, { workoutType: 'strength', startedAt: secondsAgo(10).toISOString(), exercises: [{ exerciseId: exercise.body.id, sets: [{ reps: 10 }] }] });

      await expect(prisma.exercise.delete({ where: { id: exercise.body.id } })).rejects.toThrow();

      expect(await prisma.exercise.count({ where: { id: exercise.body.id } })).toBe(1);
      expect((await http().get(`/api/v1/workouts/${workout.body.id}`).set(bearer(userA.token)).expect(200)).body.exercises[0].name).toBe(exercise.body.name);
    });
  });

  describe('Tombstone retention', () => {
    it('purges workouts (with their exercises and sets) deleted past the retention window, and only those', async () => {
      const now = Date.now();
      const makeWorkout = (title: string, deletedDaysAgo: number | null) =>
        prisma.workout.create({
          data: {
            userId: userA.userId,
            title,
            workoutType: 'strength',
            startedAt: new Date(now - 400 * 86_400_000),
            source: 'manual',
            deletedAt: deletedDaysAgo === null ? null : new Date(now - deletedDaysAgo * 86_400_000),
            exercises: { create: [{ exerciseId: squat, sortOrder: 0, sets: { create: [{ setNumber: 1, reps: 5 }] } }] },
          },
        });
      const expired = await makeWorkout('deleted 200d ago', 200);
      const kept = [await makeWorkout('deleted 89d ago', 89), await makeWorkout('never deleted', null)];

      await app.get(FitnessTombstoneRetentionCron).purge();

      const remaining = new Set((await prisma.workout.findMany({ where: { userId: userA.userId }, select: { id: true } })).map((w) => w.id));
      expect(remaining.has(expired.id)).toBe(false);
      for (const workout of kept) expect(remaining.has(workout.id), workout.title ?? '').toBe(true);

      expect(await prisma.workoutExercise.count({ where: { workoutId: expired.id } })).toBe(0);
      expect(await prisma.workoutSet.count({ where: { workoutExercise: { workoutId: expired.id } } })).toBe(0);
      expect(await prisma.workoutExercise.count({ where: { workoutId: kept[0].id } })).toBe(1);
      expect(await prisma.workoutSet.count({ where: { workoutExercise: { workoutId: kept[0].id } } })).toBe(1);
    });
  });
});
