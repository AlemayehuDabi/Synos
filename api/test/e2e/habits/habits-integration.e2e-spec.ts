import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../src/lib/prisma.js';
import { HabitTombstoneRetentionCron } from '../../../src/habits/habit-tombstone-retention.cron.js';
import { ReviewGenerationService } from '../../../src/reviews/review-generation.service.js';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser, waitForExportReady } from '../helpers.js';

describe('Habits: Today/Review integration, export, deletion cascade and retention (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let prisma: PrismaService;
  let userA: TestUser;
  let userB: TestUser;

  const create = (user: TestUser, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/v1/habits').set(bearer(user.token)).send(body).expect(201);
  const upsertEntry = (user: TestUser, habitId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`/api/v1/habits/${habitId}/entries`).set(bearer(user.token)).send(body).expect(200);

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    prisma = app.get(PrismaService);
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  it('shows active habits scheduled today, with today\'s entry status, under the habits section of GET /today', async () => {
    const daily = await create(userA, { title: 'Meditate', type: 'build', schedule: 'daily' });
    await upsertEntry(userA, daily.body.id, {});
    const other = await create(userA, { title: 'Journal', type: 'build', schedule: 'daily' });
    const archived = await create(userA, { title: 'Old habit', type: 'build', schedule: 'daily' });
    await request(app.getHttpServer()).post(`/api/v1/habits/${archived.body.id}/archive`).set(bearer(userA.token)).send({}).expect(200);

    const res = await request(app.getHttpServer()).get('/api/v1/today').set(bearer(userA.token)).expect(200);
    const section = res.body.sections.find((s: { domain: string }) => s.domain === 'habits');
    expect(section.status).toBe('ok');
    expect(section.summary.scheduledCount).toBeGreaterThanOrEqual(2);
    expect(section.summary.doneCount).toBeGreaterThanOrEqual(1);
    const meditate = section.items.find((i: { id: string }) => i.id === daily.body.id);
    expect(meditate).toMatchObject({ title: 'Meditate', entryStatus: 'done' });
    const journal = section.items.find((i: { id: string }) => i.id === other.body.id);
    expect(journal).toMatchObject({ title: 'Journal', entryStatus: null });
    expect(section.items.some((i: { id: string }) => i.id === archived.body.id)).toBe(false);
  });

  it('GET /habits/today answers the same shape as the Today contributor section', async () => {
    const isolated = await signUpAndVerify(app, sentMails);
    const daily = await create(isolated, { title: 'Stretch', type: 'build', schedule: 'daily' });
    await upsertEntry(isolated, daily.body.id, { status: 'done' });

    const direct = await request(app.getHttpServer()).get('/api/v1/habits/today').set(bearer(isolated.token)).expect(200);
    const today = await request(app.getHttpServer()).get('/api/v1/today').set(bearer(isolated.token)).expect(200);
    const section = today.body.sections.find((s: { domain: string }) => s.domain === 'habits');
    expect(direct.body).toEqual({ summary: section.summary, items: section.items });
  });

  it('a specificDays habit is only listed on its scheduled weekdays', async () => {
    const isolated = await signUpAndVerify(app, sentMails);
    const todayWeekday = new Date().getUTCDay();
    const notToday = (todayWeekday + 1) % 7;
    const notScheduled = await create(isolated, { title: 'Not today', type: 'build', schedule: 'specificDays', scheduleDays: [notToday] });
    const scheduled = await create(isolated, { title: 'Today', type: 'build', schedule: 'specificDays', scheduleDays: [todayWeekday] });

    const res = await request(app.getHttpServer()).get('/api/v1/habits/today').set(bearer(isolated.token)).expect(200);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(scheduled.body.id);
    expect(ids).not.toContain(notScheduled.body.id);
  });

  it('feeds completed/slips/completionRate into the weekly review\'s habits section, with per-habit highlights', async () => {
    // A Monday-Sunday week safely in the past relative to "now", so the review always covers it.
    const habit = await prisma.habit.create({
      data: {
        userId: userB.userId,
        title: 'Read',
        type: 'build',
        schedule: 'daily',
        scheduleDays: [],
        timezone: 'UTC',
        source: 'manual',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    });
    // Week of 2026-01-05 (Mon) - 2026-01-11 (Sun): done on 3 of 7 days.
    for (const date of ['2026-01-05', '2026-01-06', '2026-01-07']) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.habitEntry.create({ data: { habitId: habit.id, userId: userB.userId, date: new Date(`${date}T00:00:00Z`), status: 'done', source: 'manual' } });
    }
    await prisma.habitEntry.create({ data: { habitId: habit.id, userId: userB.userId, date: new Date('2026-01-08T00:00:00Z'), status: 'slipped', source: 'manual' } });

    const generation = app.get(ReviewGenerationService);
    await generation.generateForUser(userB.userId, new Date('2026-01-12T02:30:00Z'));

    const res = await request(app.getHttpServer()).get('/api/v1/reviews').query({ type: 'weekly', limit: '5' }).set(bearer(userB.token)).expect(200);
    const review = res.body.items.find((r: { periodStart: string }) => r.periodStart === '2026-01-05');
    expect(review).toBeTruthy();
    const section = review.sections.find((s: { domain: string }) => s.domain === 'habits');
    expect(section).toMatchObject({ status: 'ok', metrics: { completed: 3, slips: 1, completionRate: 0.43 } }); // round2(3/7)
    expect(section.highlights.some((h: string) => h.includes('Read'))).toBe(true);
  });

  it('includes habits and entries in a data export, scoped to the exporting user', async () => {
    const habit = await create(userA, { title: 'Exported habit', type: 'build', schedule: 'daily' });
    const entry = await upsertEntry(userA, habit.body.id, { date: '2026-09-01', status: 'done' });
    await create(userB, { title: 'Not exported', type: 'build', schedule: 'daily' });

    const job = await request(app.getHttpServer()).post('/api/v1/me/export').set(bearer(userA.token)).expect(201);
    const ready = await waitForExportReady(app, userA.token, job.body.id);
    const data = JSON.parse(ready.text);

    const habitIds = data.habits.map((h: { id: string }) => h.id);
    expect(habitIds).toContain(habit.body.id);
    expect(data.habits.every((h: { title: string }) => h.title !== 'Not exported')).toBe(true);

    const entryIds = data.habitEntries.map((e: { id: string }) => e.id);
    expect(entryIds).toContain(entry.body.id);
  });

  it('cascades habit and entry deletion when the account is deleted, without touching another user\'s data', async () => {
    const toDelete = await signUpAndVerify(app, sentMails);
    const habit = await create(toDelete, { title: 'Doomed', type: 'build', schedule: 'daily' });
    await upsertEntry(toDelete, habit.body.id, { date: '2026-09-01', status: 'done' });

    const bystanderHabitsBefore = await prisma.habit.count({ where: { userId: userA.userId } });

    await request(app.getHttpServer()).delete('/api/v1/me').set(bearer(toDelete.token)).send({ password: toDelete.password }).expect(204);

    expect(await prisma.habit.count({ where: { userId: toDelete.userId } })).toBe(0);
    expect(await prisma.habitEntry.count({ where: { habitId: habit.body.id } })).toBe(0);
    expect(await prisma.habit.count({ where: { userId: userA.userId } })).toBe(bystanderHabitsBefore);
  });

  it('purges tombstoned habits and independently-tombstoned entries past the retention window, and only those', async () => {
    const now = Date.now();
    const makeHabit = (title: string, deletedDaysAgo: number | null) =>
      prisma.habit.create({
        data: {
          userId: userA.userId,
          title,
          type: 'build',
          schedule: 'daily',
          scheduleDays: [],
          timezone: 'UTC',
          source: 'manual',
          deletedAt: deletedDaysAgo === null ? null : new Date(now - deletedDaysAgo * 86_400_000),
        },
      });
    const expiredHabit = await makeHabit('deleted habit 200d ago', 200);
    const keptHabits = [await makeHabit('deleted habit 89d ago', 89), await makeHabit('never deleted habit', null)];

    const liveHabit = await makeHabit('live habit with tombstoned entries', null);
    const expiredEntry = await prisma.habitEntry.create({
      data: { habitId: liveHabit.id, userId: userA.userId, date: new Date('2020-01-01T00:00:00Z'), status: 'done', source: 'manual', deletedAt: new Date(now - 200 * 86_400_000) },
    });
    const keptEntry = await prisma.habitEntry.create({
      data: { habitId: liveHabit.id, userId: userA.userId, date: new Date('2020-01-02T00:00:00Z'), status: 'done', source: 'manual', deletedAt: new Date(now - 89 * 86_400_000) },
    });

    await app.get(HabitTombstoneRetentionCron).purge();

    const remainingHabits = new Set((await prisma.habit.findMany({ where: { userId: userA.userId } })).map((h) => h.id));
    expect(remainingHabits.has(expiredHabit.id)).toBe(false);
    for (const habit of keptHabits) expect(remainingHabits.has(habit.id), habit.title).toBe(true);

    const remainingEntries = new Set((await prisma.habitEntry.findMany({ where: { habitId: liveHabit.id } })).map((e) => e.id));
    expect(remainingEntries.has(expiredEntry.id)).toBe(false);
    expect(remainingEntries.has(keptEntry.id)).toBe(true);
  });
});
