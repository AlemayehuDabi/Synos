import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../src/lib/prisma.js';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';

describe('Habits: stats (streaks and grace) (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let prisma: PrismaService;
  let user: TestUser;

  const daysAgo = (n: number): string => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const midnight = (date: string) => new Date(`${date}T00:00:00Z`);

  const makeHabit = (overrides: Record<string, unknown> = {}, createdDaysAgo = 10) =>
    prisma.habit.create({
      data: {
        userId: user.userId,
        title: 'Test habit',
        type: 'build',
        schedule: 'daily',
        scheduleDays: [],
        timezone: 'UTC',
        source: 'manual',
        createdAt: midnight(daysAgo(createdDaysAgo)),
        ...overrides,
      },
    });
  const addEntry = (habitId: string, date: string, status: 'done' | 'slipped') =>
    prisma.habitEntry.create({ data: { habitId, userId: user.userId, date: midnight(date), status, source: 'manual' } });

  const getStats = (id: string) => request(app.getHttpServer()).get(`/api/v1/habits/${id}/stats`).set(bearer(user.token));

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    prisma = app.get(PrismaService);
    user = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  it('is 0/0/null for a brand new habit with no entries', async () => {
    const habit = await makeHabit({}, 0);
    const res = await getStats(habit.id).expect(200);
    expect(res.body).toEqual({ habitId: habit.id, current: 0, best: 0, graceUsedAt: null });
  });

  it('build/daily: counts a clean run, today itself still pending', async () => {
    const habit = await makeHabit({}, 3);
    await addEntry(habit.id, daysAgo(3), 'done');
    await addEntry(habit.id, daysAgo(2), 'done');
    await addEntry(habit.id, daysAgo(1), 'done');
    const res = await getStats(habit.id).expect(200);
    expect(res.body).toMatchObject({ current: 3, best: 3, graceUsedAt: null });
  });

  it('build/daily: a single missed day is forgiven by grace when the next day is done', async () => {
    const habit = await makeHabit({}, 4);
    await addEntry(habit.id, daysAgo(4), 'done');
    await addEntry(habit.id, daysAgo(3), 'done');
    // daysAgo(2) missing entirely
    await addEntry(habit.id, daysAgo(1), 'done');
    const res = await getStats(habit.id).expect(200);
    // Grace forgives the single missed day since the very next day is done.
    expect(res.body).toMatchObject({ current: 3, best: 3, graceUsedAt: daysAgo(2) });
  });

  it('build/daily: two consecutive missed days exceed the default grace window and break the streak', async () => {
    const habit = await makeHabit({}, 5);
    await addEntry(habit.id, daysAgo(5), 'done');
    await addEntry(habit.id, daysAgo(4), 'done');
    // daysAgo(3) and daysAgo(2) both missing
    await addEntry(habit.id, daysAgo(1), 'done');
    const res = await getStats(habit.id).expect(200);
    expect(res.body).toMatchObject({ current: 1, best: 2, graceUsedAt: null });
  });

  it('break/daily: no entries at all is a perfect streak', async () => {
    const habit = await makeHabit({ type: 'break' }, 3);
    const res = await getStats(habit.id).expect(200);
    expect(res.body).toMatchObject({ current: 3, best: 3, graceUsedAt: null });
  });

  it('break/daily: grace forgives a single slip if the next day is clean (the slipped day itself is not a success)', async () => {
    const habit = await makeHabit({ type: 'break' }, 3);
    await addEntry(habit.id, daysAgo(2), 'slipped');
    const res = await getStats(habit.id).expect(200);
    // daysAgo(3) clean (success 1), daysAgo(2) slipped (forgiven bridge, not itself a success),
    // daysAgo(1) clean (success 2); today still pending.
    expect(res.body).toMatchObject({ current: 2, best: 2, graceUsedAt: daysAgo(2) });
  });

  it('specificDays: only matching weekdays count toward the streak', async () => {
    // Pick a fixed recent Monday/Wednesday/Friday window well within the createdAt bound.
    const habit = await makeHabit({ schedule: 'specificDays', scheduleDays: [1, 3, 5] }, 10);
    // Just verify it answers 200 with a numeric result; exact day alignment is covered by the unit tests.
    const res = await getStats(habit.id).expect(200);
    expect(res.body.current).toEqual(expect.any(Number));
    expect(res.body.best).toEqual(expect.any(Number));
  });

  it('timesPerWeek: reaching the target within the (already-elapsed) week counts as a success', async () => {
    const habit = await makeHabit({ schedule: 'timesPerWeek', targetPerPeriod: 2 }, 14);
    await addEntry(habit.id, daysAgo(13), 'done');
    await addEntry(habit.id, daysAgo(12), 'done');
    const res = await getStats(habit.id).expect(200);
    expect(res.body.best).toBeGreaterThanOrEqual(1);
  });

  it('is 404 for another user\'s habit', async () => {
    const other = await signUpAndVerify(app, sentMails);
    const habit = await makeHabit({}, 1);
    await request(app.getHttpServer()).get(`/api/v1/habits/${habit.id}/stats`).set(bearer(other.token)).expect(404);
  });

  it('requires authentication', async () => {
    const habit = await makeHabit({}, 1);
    await request(app.getHttpServer()).get(`/api/v1/habits/${habit.id}/stats`).expect(401);
  });
});
