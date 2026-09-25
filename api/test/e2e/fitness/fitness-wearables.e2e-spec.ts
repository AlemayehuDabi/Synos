import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../src/lib/prisma.js';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser, updateSettings } from '../helpers.js';

describe('Fitness: wearables (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let prisma: PrismaService;
  let userA: TestUser;
  let userB: TestUser;

  const http = () => request(app.getHttpServer());
  const ingest = (user: TestUser, samples: Record<string, unknown>[]) => http().post('/api/v1/wearables/samples').set(bearer(user.token)).send({ samples });
  const sleep = (user: TestUser, query: Record<string, string> = {}) => http().get('/api/v1/wearables/sleep').query(query).set(bearer(user.token));
  const sample = (overrides: Record<string, unknown> = {}) => ({
    type: 'steps',
    startsAt: '2026-09-24T08:00:00Z',
    endsAt: '2026-09-24T09:00:00Z',
    value: { count: 1200 },
    sourceDevice: 'Test Watch',
    dedupeKey: `steps-${randomUUID()}`,
    ...overrides,
  });
  const storedFor = (user: TestUser) => prisma.wearableSample.count({ where: { userId: user.userId } });

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    prisma = app.get(PrismaService);
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('batch ingest', () => {
    it('stores every sample type and reports what happened', async () => {
      const before = await storedFor(userA);
      const res = await ingest(userA, [
        sample({ type: 'steps', value: { count: 900 } }),
        sample({ type: 'sleep', startsAt: '2026-09-23T23:00:00Z', endsAt: '2026-09-24T06:00:00Z', value: { durationMinutes: 400 }, dedupeKey: `sleep-${randomUUID()}` }),
        sample({ type: 'heartRate', value: { bpm: 61 }, dedupeKey: `hr-${randomUUID()}` }),
        sample({ type: 'activeEnergy', value: { kcal: 310.5 }, dedupeKey: `ae-${randomUUID()}` }),
        sample({ type: 'workout', value: { workoutType: 'run', durationMinutes: 30 }, dedupeKey: `wo-${randomUUID()}` }),
      ]).expect(200);
      expect(res.body).toEqual({ received: 5, created: 5, duplicates: 0, conflicts: 0 });
      expect(await storedFor(userA)).toBe(before + 5);
    });

    it('ignores a dedupeKey that is already stored, however many times it is re-sent', async () => {
      const batch = [sample(), sample()];
      expect((await ingest(userA, batch).expect(200)).body).toEqual({ received: 2, created: 2, duplicates: 0, conflicts: 0 });
      const before = await storedFor(userA);
      expect((await ingest(userA, batch).expect(200)).body).toEqual({ received: 2, created: 0, duplicates: 2, conflicts: 0 });
      expect((await ingest(userA, [batch[0], sample()]).expect(200)).body).toEqual({ received: 2, created: 1, duplicates: 1, conflicts: 0 });
      expect(await storedFor(userA)).toBe(before + 1);
    });

    it('counts a key repeated within one batch as a duplicate and stores the first', async () => {
      const key = `repeat-${randomUUID()}`;
      const res = await ingest(userA, [sample({ dedupeKey: key, value: { count: 111 } }), sample({ dedupeKey: key, value: { count: 999 } })]).expect(200);
      expect(res.body).toEqual({ received: 2, created: 1, duplicates: 1, conflicts: 0 });
      const stored = await prisma.wearableSample.findUniqueOrThrow({ where: { userId_dedupeKey: { userId: userA.userId, dedupeKey: key } } });
      expect(stored.value).toMatchObject({ count: 111 });
    });

    it('scopes dedupeKey per user: another user can store the same key', async () => {
      const key = `shared-${randomUUID()}`;
      await ingest(userA, [sample({ dedupeKey: key })]).expect(200);
      expect((await ingest(userB, [sample({ dedupeKey: key })]).expect(200)).body.created).toBe(1);
    });

    it('keeps extra keys a device sends inside value', async () => {
      const key = `extra-${randomUUID()}`;
      await ingest(userA, [sample({ dedupeKey: key, value: { count: 5, motion: 'walking' } })]).expect(200);
      const stored = await prisma.wearableSample.findUniqueOrThrow({ where: { userId_dedupeKey: { userId: userA.userId, dedupeKey: key } } });
      expect(stored.value).toEqual({ count: 5, motion: 'walking' });
    });

    it('validates the whole batch before storing any of it', async () => {
      const before = await storedFor(userA);
      const res = await ingest(userA, [sample(), sample({ value: { count: -5 }, dedupeKey: `bad-${randomUUID()}` })]).expect(400);
      expect(res.body.message).toContain('samples[1]');
      expect(await storedFor(userA)).toBe(before);
    });

    it.each([
      ['an empty batch', []],
      ['a sample with a bad type', [sample({ type: 'bloodPressure' })]],
      ['a sample with no dedupeKey', [sample({ dedupeKey: undefined })]],
      ['a sample with an empty dedupeKey', [sample({ dedupeKey: '' })]],
      ['a sample with no sourceDevice', [sample({ sourceDevice: undefined })]],
      ['a sample with a bad timestamp', [sample({ startsAt: 'noon-ish' })]],
      ['a sample ending before it starts', [sample({ startsAt: '2026-09-24T09:00:00Z', endsAt: '2026-09-24T08:00:00Z' })]],
      ['a sample whose value is not an object', [sample({ value: 12 })]],
      ['a steps sample without a count', [sample({ value: {} })]],
      ['a heartRate sample with a zero bpm', [sample({ type: 'heartRate', value: { bpm: 0 } })]],
      ['an unknown property on a sample', [sample({ extra: 1 })]],
    ])('rejects %s with a 400', async (_name, samples) => {
      const res = await ingest(userA, samples as Record<string, unknown>[]).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'BAD_REQUEST' });
    });

    it('rejects a batch over 500 samples', async () => {
      await ingest(userA, Array.from({ length: 501 }, () => sample())).expect(400);
    });

    it('accepts a full batch of 500', async () => {
      const res = await ingest(userB, Array.from({ length: 500 }, () => sample())).expect(200);
      expect(res.body).toEqual({ received: 500, created: 500, duplicates: 0, conflicts: 0 });
    });

    it('replays an Idempotency-Key instead of ingesting again', async () => {
      const key = { 'Idempotency-Key': `ingest-${randomUUID()}` };
      const body = { samples: [sample()] };
      const first = await http().post('/api/v1/wearables/samples').set(bearer(userA.token)).set(key).send(body).expect(200);
      const replay = await http().post('/api/v1/wearables/samples').set(bearer(userA.token)).set(key).send(body).expect(200);
      expect(first.body.created).toBe(1);
      expect(replay.body).toEqual(first.body);
    });

    it('requires authentication', async () => {
      await http().post('/api/v1/wearables/samples').send({ samples: [sample()] }).expect(401);
    });
  });

  describe('manual workouts are ground truth', () => {
    let truth: TestUser;
    // Each test uses its own day, so one user's manual workouts never overlap another test's samples.
    const workoutSample = (day: string, overrides: Record<string, unknown> = {}) =>
      sample({ type: 'workout', startsAt: `${day}T07:00:00Z`, endsAt: `${day}T07:45:00Z`, value: { workoutType: 'run', durationMinutes: 45 }, dedupeKey: `wo-${randomUUID()}`, ...overrides });
    const manualRun = (user: TestUser, day: string, extra: Record<string, unknown> = {}) =>
      http().post('/api/v1/workouts').set(bearer(user.token)).send({ workoutType: 'run', startedAt: `${day}T07:00:00Z`, completedAt: `${day}T07:45:00Z`, ...extra }).expect(201);
    const storedSample = (user: TestUser, dedupeKey: unknown) =>
      prisma.wearableSample.findUniqueOrThrow({ where: { userId_dedupeKey: { userId: user.userId, dedupeKey: dedupeKey as string } } });
    const workoutCount = async (user: TestUser) =>
      (await http().get('/api/v1/workouts').query({ limit: '100' }).set(bearer(user.token)).expect(200)).body.items.length as number;

    beforeAll(async () => {
      truth = await signUpAndVerify(app, sentMails);
    });

    it('flags a disagreeing overlapping sample as a conflict, and changes nothing about the manual workout', async () => {
      const manual = await manualRun(truth, '2027-05-01', { notes: 'My own log' });
      const workoutsBefore = await workoutCount(truth);

      const disagreeing = workoutSample('2027-05-01', { value: { workoutType: 'cycling', durationMinutes: 90 }, endsAt: '2027-05-01T08:30:00Z' });
      const res = await ingest(truth, [disagreeing]).expect(200);
      expect(res.body).toEqual({ received: 1, created: 1, duplicates: 0, conflicts: 1 });

      expect(await storedSample(truth, disagreeing.dedupeKey)).toMatchObject({ conflict: true, conflictWorkoutId: manual.body.id, type: 'workout' });

      const after = await http().get(`/api/v1/workouts/${manual.body.id}`).set(bearer(truth.token)).expect(200);
      expect(after.body).toEqual(manual.body);
      expect(await workoutCount(truth)).toBe(workoutsBefore); // a wearable sample never becomes a workout
    });

    it('stores an agreeing overlapping sample separately, unflagged', async () => {
      await manualRun(truth, '2027-05-02');
      const agreeing = workoutSample('2027-05-02', { startsAt: '2027-05-02T07:02:00Z', endsAt: '2027-05-02T07:46:00Z', value: { workoutType: 'Run', durationMinutes: 44 } });
      expect((await ingest(truth, [agreeing]).expect(200)).body).toEqual({ received: 1, created: 1, duplicates: 0, conflicts: 0 });
      expect(await storedSample(truth, agreeing.dedupeKey)).toMatchObject({ conflict: false, conflictWorkoutId: null });
    });

    it('does not flag a sample that overlaps nothing, or one that only overlaps another user\'s workout', async () => {
      const alone = await ingest(truth, [workoutSample('2027-05-03', { value: { workoutType: 'yoga' } })]).expect(200);
      expect(alone.body.conflicts).toBe(0);
      // userA has a manual run at this time; a sample from userB during it is not a conflict.
      await manualRun(userA, '2027-06-01');
      const other = await ingest(userB, [workoutSample('2027-06-01', { value: { workoutType: 'cycling' } })]).expect(200);
      expect(other.body.conflicts).toBe(0);
    });

    it('ignores a workout that was deleted, and one that is not manual', async () => {
      const gone = await manualRun(truth, '2027-07-01');
      await http().delete(`/api/v1/workouts/${gone.body.id}`).set(bearer(truth.token)).expect(204);
      await manualRun(truth, '2027-07-02', { source: 'sync' });
      const res = await ingest(truth, [
        workoutSample('2027-07-01', { value: { workoutType: 'cycling' } }),
        workoutSample('2027-07-02', { value: { workoutType: 'cycling' } }),
      ]).expect(200);
      expect(res.body.conflicts).toBe(0);
    });
  });

  describe('GET /wearables/sleep', () => {
    const night = (wakeDate: string, minutes: number, key: string) => {
      const endsAt = new Date(`${wakeDate}T06:00:00Z`);
      return sample({ type: 'sleep', startsAt: new Date(endsAt.getTime() - minutes * 60_000).toISOString(), endsAt: endsAt.toISOString(), value: {}, dedupeKey: key });
    };
    let sleeper: TestUser;

    beforeAll(async () => {
      sleeper = await signUpAndVerify(app, sentMails);
      await ingest(sleeper, [night('2026-09-22', 480, 'n1'), night('2026-09-23', 300, 'n2'), night('2026-09-25', 360, 'n3')]).expect(200);
    });

    it('answers one entry per night with data, flagging the poor ones', async () => {
      const res = await sleep(sleeper, { from: '2026-09-21', to: '2026-09-25' }).expect(200);
      expect(res.body).toMatchObject({ from: '2026-09-21', to: '2026-09-25', timezone: 'UTC', thresholdMinutes: 360 });
      expect(res.body.nights).toEqual([
        { date: '2026-09-22', durationMinutes: 480, sampleCount: 1, poor: false },
        { date: '2026-09-23', durationMinutes: 300, sampleCount: 1, poor: true },
        { date: '2026-09-25', durationMinutes: 360, sampleCount: 1, poor: false }, // exactly the threshold is enough
      ]);
    });

    it('only includes nights inside the inclusive range', async () => {
      const res = await sleep(sleeper, { from: '2026-09-23', to: '2026-09-23' }).expect(200);
      expect(res.body.nights.map((n: { date: string }) => n.date)).toEqual(['2026-09-23']);
    });

    it('groups nights by wake-up date in the user\'s own timezone', async () => {
      const nairobi = await signUpAndVerify(app, sentMails);
      await updateSettings(app, nairobi.token, { timezone: 'Africa/Nairobi' });
      // Ends 2026-09-25T22:30Z = 2026-09-26 01:30 in Nairobi (UTC+3).
      await ingest(nairobi, [sample({ type: 'sleep', startsAt: '2026-09-25T19:00:00Z', endsAt: '2026-09-25T22:30:00Z', value: {}, dedupeKey: 'late' })]).expect(200);
      const res = await sleep(nairobi, { from: '2026-09-25', to: '2026-09-26' }).expect(200);
      expect(res.body.timezone).toBe('Africa/Nairobi');
      expect(res.body.nights).toEqual([{ date: '2026-09-26', durationMinutes: 210, sampleCount: 1, poor: true }]);
    });

    it('defaults to the last 7 days ending today', async () => {
      const res = await sleep(sleeper).expect(200);
      const today = new Date().toISOString().slice(0, 10);
      expect(res.body.to).toBe(today);
      expect(res.body.nights).toEqual(expect.any(Array));
    });

    it('never shows another user\'s sleep', async () => {
      const res = await sleep(userB, { from: '2026-09-21', to: '2026-09-25' }).expect(200);
      expect(res.body.nights).toEqual([]);
    });

    it.each([
      ['from after to', { from: '2026-09-25', to: '2026-09-20' }],
      ['a range of more than 90 days', { from: '2026-01-01', to: '2026-09-25' }],
      ['a malformed from', { from: 'nope' }],
      ['an impossible date', { to: '2026-02-30' }],
      ['an unknown query parameter', { extra: '1' }],
    ])('rejects %s with a 400', async (_name, query) => {
      await sleep(userA, query as Record<string, string>).expect(400);
    });

    it('requires authentication', async () => {
      await http().get('/api/v1/wearables/sleep').expect(401);
    });
  });
});
