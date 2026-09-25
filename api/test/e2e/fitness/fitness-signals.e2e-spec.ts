import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SleepPoorDetector } from '../../../src/fitness/detectors/sleep-poor.detector.js';
import { TrainingHeavyDetector } from '../../../src/fitness/detectors/training-heavy.detector.js';
import { PrismaService } from '../../../src/lib/prisma.js';
import { DetectorRunnerService } from '../../../src/signal-engine/bus/detector-runner.service.js';
import { SweeperCron } from '../../../src/signal-engine/bus/sweeper.cron.js';
import { SignalEngineFacade } from '../../../src/signal-engine/signal-engine.facade.js';
import { bearer, createTestApp, type SentMail, signUpAndVerify, stopScheduledJobs, type TestUser } from '../helpers.js';

// Better Auth's sign-up rate limit stays on for these specs (see helpers.ts): five users, shared per describe block.
describe('Fitness: signal engine integration (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let prisma: PrismaService;
  let runner: DetectorRunnerService;
  let sweeper: SweeperCron;
  let facade: SignalEngineFacade;

  const http = () => request(app.getHttpServer());
  const today = () => new Date().toISOString().slice(0, 10);
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
  const createWorkout = (u: TestUser, body: Record<string, unknown>) => http().post('/api/v1/workouts').set(bearer(u.token)).send(body).expect(201);
  const complete = (u: TestUser, id: string, body: Record<string, unknown> = {}) => http().post(`/api/v1/workouts/${id}/complete`).set(bearer(u.token)).send(body);
  const ingest = (u: TestUser, samples: Record<string, unknown>[]) => http().post('/api/v1/wearables/samples').set(bearer(u.token)).send({ samples }).expect(200);
  const signalsOf = async (u: TestUser, type: string) =>
    (await http().get('/api/v1/signals').query({ type, limit: '100' }).set(bearer(u.token)).expect(200)).body.items as {
      sourceDomain: string;
      subjectType: string | null;
      subjectId: string | null;
      dedupeKey: string | null;
      payload: Record<string, unknown>;
    }[];
  const pendingTitles = async (u: TestUser) =>
    ((await http().get('/api/v1/inbox').query({ status: 'pending', limit: '100' }).set(bearer(u.token)).expect(200)).body.items as { title: string; targetKey: string }[]).map((s) => s.title);
  /** A workout that finished `endedMinutesAgo` minutes ago after `minutes` minutes of effort. */
  const finishedWorkout = (u: TestUser, minutes: number, endedMinutesAgo: number, extra: Record<string, unknown> = {}) =>
    createWorkout(u, { workoutType: 'strength', startedAt: minutesAgo(endedMinutesAgo + minutes).toISOString(), completedAt: minutesAgo(endedMinutesAgo).toISOString(), durationMinutes: minutes, ...extra });
  const sleepSample = (endsAt: Date, minutes: number) => ({
    type: 'sleep',
    startsAt: new Date(endsAt.getTime() - minutes * 60_000).toISOString(),
    endsAt: endsAt.toISOString(),
    value: {},
    sourceDevice: 'Test Ring',
    dedupeKey: `sleep-${randomUUID()}`,
  });
  const createTask = (u: TestUser, title: string) => http().post('/api/v1/tasks').set(bearer(u.token)).send({ title, dueAt: `${today()}T23:00:00Z` }).expect(201);

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    stopScheduledJobs(app); // the real detector and sweeper schedules must never fire mid-test
    prisma = app.get(PrismaService);
    runner = app.get(DetectorRunnerService);
    sweeper = app.get(SweeperCron);
    facade = app.get(SignalEngineFacade);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('workout.completed', () => {
    let user: TestUser;
    beforeAll(async () => {
      user = await signUpAndVerify(app, sentMails);
    });

    it('is emitted once when a workout is completed, carrying its details', async () => {
      const workout = await createWorkout(user, { workoutType: 'run', startedAt: minutesAgo(60).toISOString() });
      expect(await signalsOf(user, 'workout.completed')).toEqual([]);

      const done = await complete(user, workout.body.id, { durationMinutes: 55 }).expect(200);
      const emitted = (await signalsOf(user, 'workout.completed')).filter((s) => s.subjectId === workout.body.id);
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({
        sourceDomain: 'fitness',
        subjectType: 'workout',
        dedupeKey: `workout-completed:${workout.body.id}`,
        payload: { workoutId: workout.body.id, completedAt: done.body.completedAt, durationMinutes: 55, workoutType: 'run' },
      });
    });

    it('derives the duration from the timestamps when none was recorded', async () => {
      const startedAt = minutesAgo(90);
      const workout = await createWorkout(user, { workoutType: 'cycling', startedAt: startedAt.toISOString() });
      await complete(user, workout.body.id, { completedAt: new Date(startedAt.getTime() + 45 * 60_000).toISOString() }).expect(200);
      const emitted = (await signalsOf(user, 'workout.completed')).find((s) => s.subjectId === workout.body.id);
      expect(emitted?.payload).toMatchObject({ durationMinutes: 45, workoutType: 'cycling' });
    });

    it('is not emitted a second time: completing again conflicts and adds no signal', async () => {
      const workout = await createWorkout(user, { workoutType: 'swim', startedAt: minutesAgo(30).toISOString() });
      await complete(user, workout.body.id).expect(200);
      await complete(user, workout.body.id).expect(409);
      expect((await signalsOf(user, 'workout.completed')).filter((s) => s.subjectId === workout.body.id)).toHaveLength(1);
    });

    it('is not emitted when a workout is merely created, edited or deleted, or when a wearable reports one', async () => {
      const before = (await signalsOf(user, 'workout.completed')).length;
      const workout = await createWorkout(user, { workoutType: 'yoga', startedAt: minutesAgo(20).toISOString() });
      await http().patch(`/api/v1/workouts/${workout.body.id}`).set(bearer(user.token)).send({ notes: 'Slow flow' }).expect(200);
      await http().delete(`/api/v1/workouts/${workout.body.id}`).set(bearer(user.token)).expect(204);
      await ingest(user, [
        {
          type: 'workout',
          startsAt: minutesAgo(600).toISOString(),
          endsAt: minutesAgo(560).toISOString(),
          value: { workoutType: 'run', durationMinutes: 40 },
          sourceDevice: 'Test Watch',
          dedupeKey: `wo-${randomUUID()}`,
        },
      ]);
      expect((await signalsOf(user, 'workout.completed')).length).toBe(before);
    });

    it('lets the Habits module (not Fitness) propose the check-in, and Fitness writes nothing into habits', async () => {
      const habit = await http().post('/api/v1/habits').set(bearer(user.token)).send({ title: 'Go for a run', type: 'build', schedule: 'daily' }).expect(201);
      const workout = await createWorkout(user, { workoutType: 'run', startedAt: minutesAgo(40).toISOString() });
      await complete(user, workout.body.id).expect(200);

      // The signal went out through the transactional outbox, so it is the sweeper that delivers it.
      await sweeper.sweep();
      const suggestions = (await http().get('/api/v1/inbox').query({ status: 'pending', limit: '100' }).set(bearer(user.token)).expect(200)).body.items as { targetKey: string }[];
      expect(suggestions.some((s) => s.targetKey === `habit:${habit.body.id}:${today()}`)).toBe(true);

      const entries = await http().get(`/api/v1/habits/${habit.body.id}/entries`).query({ from: today(), to: today() }).set(bearer(user.token)).expect(200);
      expect(entries.body).toEqual([]); // nothing is checked off until the user (or auto mode) approves it
    });
  });

  describe('sleep.poor detector', () => {
    let sleepy: TestUser;
    let rested: TestUser;
    let task: { id: string; dueAt: string };

    beforeAll(async () => {
      sleepy = await signUpAndVerify(app, sentMails);
      rested = await signUpAndVerify(app, sentMails);
      const now = minutesAgo(0);
      await ingest(sleepy, [sleepSample(new Date(now.getTime() - 1_000), 300)]); // 5h: under the 6h default
      await ingest(rested, [
        sleepSample(new Date(now.getTime() - 1_000), 360), // exactly the threshold is enough
        sleepSample(minutesAgo(26 * 60), 200), // a poor night, but not the one that ended today
      ]);
      task = (await createTask(sleepy, 'Draft the proposal')).body;
    });

    it('emits sleep.poor once for a poor night that ended today, however many times it runs', async () => {
      await runner.runDetectorForTesting('fitness-sleep-poor');
      await runner.runDetectorForTesting('fitness-sleep-poor');
      await runner.runDetectorForTesting('fitness-sleep-poor');

      const emitted = await signalsOf(sleepy, 'sleep.poor');
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({ sourceDomain: 'fitness', dedupeKey: `sleep-poor:${today()}`, payload: { date: today(), durationMinutes: 300 } });
    });

    it('emits nothing for enough sleep, or for a poor night that was not today\'s', async () => {
      await runner.runDetectorForTesting('fitness-sleep-poor');
      expect(await signalsOf(rested, 'sleep.poor')).toEqual([]);
    });

    it('feeds the Tasks recovery connection, which only ever proposes: the task itself is untouched', async () => {
      expect(await pendingTitles(sleepy)).toContain('Lighten load: Draft the proposal');
      const after = await http().get(`/api/v1/tasks/${task.id}`).set(bearer(sleepy.token)).expect(200);
      expect(after.body.dueAt).toBe(task.dueAt);
    });

    it('reads its threshold from FITNESS_SLEEP_POOR_THRESHOLD_MIN', async () => {
      const strict = { get: (key: string, fallback?: unknown) => (key === 'FITNESS_SLEEP_POOR_THRESHOLD_MIN' ? 400 : fallback) } as unknown as ConfigService;
      await new SleepPoorDetector(prisma, facade, strict).run(); // 360 minutes is now short of the bar
      const emitted = await signalsOf(rested, 'sleep.poor');
      expect(emitted).toHaveLength(1);
      expect(emitted[0].payload).toMatchObject({ date: today(), durationMinutes: 360 });
    });
  });

  describe('training.heavy detector', () => {
    let heavy: TestUser;
    let light: TestUser;

    beforeAll(async () => {
      heavy = await signUpAndVerify(app, sentMails);
      light = await signUpAndVerify(app, sentMails);
      // 2 x 300 min at the default effort of 5 = a 3000 load, over the 2500 default.
      await finishedWorkout(heavy, 300, 24 * 60);
      await finishedWorkout(heavy, 300, 2 * 24 * 60);
      await createTask(heavy, 'Write the report');

      await finishedWorkout(light, 60, 60); // 300
      await finishedWorkout(light, 600, 10 * 24 * 60); // far outside the 7-day window
      const deleted = await finishedWorkout(light, 900, 2 * 24 * 60);
      await http().delete(`/api/v1/workouts/${deleted.body.id}`).set(bearer(light.token)).expect(204);
      await createWorkout(light, { workoutType: 'strength', startedAt: minutesAgo(120).toISOString(), durationMinutes: 1000 }); // never completed
    });

    it('emits training.heavy once when the last 7 days add up to the threshold, however many times it runs', async () => {
      await runner.runDetectorForTesting('fitness-training-heavy');
      await runner.runDetectorForTesting('fitness-training-heavy');
      await runner.runDetectorForTesting('fitness-training-heavy');

      const emitted = await signalsOf(heavy, 'training.heavy');
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({ sourceDomain: 'fitness', dedupeKey: `training-heavy:${today()}`, payload: { date: today(), loadScore: 3000, windowDays: 7 } });
    });

    it('does not count old, deleted or unfinished workouts', async () => {
      await runner.runDetectorForTesting('fitness-training-heavy');
      expect(await signalsOf(light, 'training.heavy')).toEqual([]);
    });

    it('weights the load by the effort logged on the sets', async () => {
      // 60 minutes at RPE 9 is 540: heavy under a threshold of 500, not under the default.
      const workout = await createWorkout(light, { workoutType: 'strength', startedAt: minutesAgo(200).toISOString(), completedAt: minutesAgo(140).toISOString(), durationMinutes: 60 });
      const exercise = (await http().get('/api/v1/exercises').query({ q: 'Bench Press', isCustom: 'false' }).set(bearer(light.token)).expect(200)).body.items[0];
      await http()
        .patch(`/api/v1/workouts/${workout.body.id}`)
        .set(bearer(light.token))
        .send({ exercises: [{ exerciseId: exercise.id, sets: [{ reps: 5, weightKg: 100, rpe: 9 }] }] })
        .expect(200);

      const strict = { get: (key: string, fallback?: unknown) => (key === 'FITNESS_HEAVY_LOAD_THRESHOLD' ? 800 : fallback) } as unknown as ConfigService;
      await new TrainingHeavyDetector(prisma, facade, strict).run(); // 300 + 540 = 840
      const emitted = await signalsOf(light, 'training.heavy');
      expect(emitted).toHaveLength(1);
      expect(emitted[0].payload).toMatchObject({ loadScore: 840 });
    });

    it('feeds the Tasks recovery connection, which only proposes', async () => {
      expect(await pendingTitles(heavy)).toContain('Lighten load: Write the report');
    });
  });
});
