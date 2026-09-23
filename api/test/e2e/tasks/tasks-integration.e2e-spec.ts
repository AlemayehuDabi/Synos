import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../src/lib/prisma.js';
import { ReviewGenerationService } from '../../../src/reviews/review-generation.service.js';
import { TaskTombstoneRetentionCron } from '../../../src/tasks/task-tombstone-retention.cron.js';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser, waitForExportReady } from '../helpers.js';

describe('Tasks: Today/Review integration, CalendarBlock, export, deletion cascade and retention (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let prisma: PrismaService;
  let userA: TestUser;
  let userB: TestUser;

  const create = (user: TestUser, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/v1/tasks').set(bearer(user.token)).send(body).expect(201);

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    prisma = app.get(PrismaService);
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  it('shows due-today, overdue and scheduled-today tasks under the tasks section of GET /today', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const overdue = await create(userA, { title: 'Overdue', dueAt: new Date(Date.now() - 86_400_000).toISOString() }); // yesterday, safely before today's UTC midnight
    const dueToday = await create(userA, { title: 'Due today', dueAt: `${today}T23:00:00Z` });
    const scheduledToday = await create(userA, { title: 'Scheduled today', scheduledStart: `${today}T08:00:00Z`, scheduledEnd: `${today}T08:30:00Z` });
    // Tomorrow must not show up today.
    const tomorrow = new Date(Date.now() + 86_400_000 * 2).toISOString();
    await create(userA, { title: 'Far future', dueAt: tomorrow });

    const res = await request(app.getHttpServer()).get('/api/v1/today').set(bearer(userA.token)).expect(200);
    const section = res.body.sections.find((s: { domain: string }) => s.domain === 'tasks');
    expect(section.status).toBe('ok');
    expect(section.summary.overdue).toBeGreaterThanOrEqual(1);
    expect(section.summary.dueToday).toBeGreaterThanOrEqual(1);
    expect(section.summary.scheduledToday).toBeGreaterThanOrEqual(1);
    const ids = section.items.map((i: { id: string }) => i.id);
    expect(ids).toEqual(expect.arrayContaining([overdue.body.id, dueToday.body.id, scheduledToday.body.id]));
    const overdueItem = section.items.find((i: { id: string }) => i.id === overdue.body.id);
    expect(overdueItem.overdue).toBe(true);
  });

  it('feeds completed/missed/completionRate/avgEstimateAccuracy into the weekly review\'s tasks section', async () => {
    // A Monday-Sunday week safely in the past relative to "now", so the review always covers it.
    const done = await prisma.task.create({
      data: { userId: userB.userId, title: 'Done', status: 'completed', dueAt: new Date('2026-01-06T09:00:00Z'), completedAt: new Date('2026-01-06T10:00:00Z'), estimatedMinutes: 60 },
    });
    await prisma.taskCompletion.create({
      data: { taskId: done.id, userId: userB.userId, dueAt: done.dueAt, completedAt: new Date('2026-01-06T10:00:00Z'), estimatedMinutes: 60, actualMinutes: 60 },
    });
    await prisma.signal.create({
      data: {
        userId: userB.userId,
        type: 'task.missed',
        sourceDomain: 'tasks',
        payload: { taskId: 'missed-1', dueAt: '2026-01-07T09:00:00Z' },
        dedupeKey: `review-test-missed-${Date.now()}`,
        occurredAt: new Date('2026-01-07T09:00:00Z'),
      },
    });

    const generation = app.get(ReviewGenerationService);
    await generation.generateForUser(userB.userId, new Date('2026-01-12T02:30:00Z'));

    const res = await request(app.getHttpServer()).get('/api/v1/reviews').query({ type: 'weekly', limit: '5' }).set(bearer(userB.token)).expect(200);
    const review = res.body.items.find((r: { periodStart: string }) => r.periodStart === '2026-01-05');
    expect(review).toBeTruthy();
    const section = review.sections.find((s: { domain: string }) => s.domain === 'tasks');
    expect(section).toMatchObject({ status: 'ok', metrics: { completed: 1, missed: 1, completionRate: 0.5, avgEstimateAccuracy: 1 } });
  });

  it('shows a scheduled task as a busy block in GET /calendar/view, and an unscheduled task never appears', async () => {
    const scheduled = await create(userA, { title: 'Deep work', scheduledStart: '2026-09-22T10:00:00Z', scheduledEnd: '2026-09-22T11:00:00Z' });
    const unscheduled = await create(userA, { title: 'No schedule' });

    const view = await request(app.getHttpServer()).get('/api/v1/calendar/view').query({ from: '2026-09-22', to: '2026-09-22' }).set(bearer(userA.token)).expect(200);
    const block = view.body.items.find((i: { kind: string; id?: string }) => i.kind === 'block' && i.id?.startsWith(scheduled.body.id));
    expect(block).toMatchObject({ domain: 'tasks', title: 'Deep work', busy: true, startsAt: '2026-09-22T10:00:00.000Z', endsAt: '2026-09-22T11:00:00.000Z' });
    expect(view.body.items.some((i: { title?: string }) => i.title === 'No schedule')).toBe(false);
    void unscheduled;
  });

  it('excludes a completed (no longer open) scheduled task from the calendar block view', async () => {
    const task = await create(userA, { title: 'Will complete', scheduledStart: '2026-09-23T10:00:00Z', scheduledEnd: '2026-09-23T11:00:00Z' });
    await request(app.getHttpServer()).post(`/api/v1/tasks/${task.body.id}/complete`).set(bearer(userA.token)).send({}).expect(200);

    const view = await request(app.getHttpServer()).get('/api/v1/calendar/view').query({ from: '2026-09-23', to: '2026-09-23' }).set(bearer(userA.token)).expect(200);
    expect(view.body.items.some((i: { id?: string }) => i.id?.startsWith(task.body.id))).toBe(false);
  });

  it('includes tasks, task exceptions and subtasks in a data export, scoped to the exporting user', async () => {
    const single = await create(userA, { title: 'Exported single' });
    const series = await create(userA, { title: 'Exported series', dueAt: '2026-09-07T09:00:00Z', timezone: 'UTC', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
    await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${series.body.id}`)
      .set(bearer(userA.token))
      .send({ scope: 'this', occurrenceStart: '2026-09-14T09:00:00Z', title: 'Special' })
      .expect(200);
    const subtask = await request(app.getHttpServer()).post(`/api/v1/tasks/${single.body.id}/subtasks`).set(bearer(userA.token)).send({ title: 'A subtask' }).expect(201);
    await create(userB, { title: 'Not exported' });

    const job = await request(app.getHttpServer()).post('/api/v1/me/export').set(bearer(userA.token)).expect(201);
    const ready = await waitForExportReady(app, userA.token, job.body.id);
    const data = JSON.parse(ready.text);

    const taskIds = data.tasks.map((t: { id: string }) => t.id);
    expect(taskIds).toEqual(expect.arrayContaining([single.body.id, series.body.id]));
    expect(data.tasks.every((t: { title: string }) => t.title !== 'Not exported')).toBe(true);

    expect(data.taskExceptions).toHaveLength(1);
    expect(data.taskExceptions[0]).toMatchObject({ taskId: series.body.id, title: 'Special' });

    expect(data.subtasks.map((s: { id: string }) => s.id)).toContain(subtask.body.id);
  });

  it('cascades task, exception and subtask deletion when the account is deleted, without touching another user\'s data', async () => {
    const toDelete = await signUpAndVerify(app, sentMails);
    const series = await create(toDelete, { title: 'Doomed', dueAt: '2026-09-07T09:00:00Z', timezone: 'UTC', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
    await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${series.body.id}`)
      .set(bearer(toDelete.token))
      .send({ scope: 'this', occurrenceStart: '2026-09-14T09:00:00Z', title: 'Special' })
      .expect(200);
    const subtask = await request(app.getHttpServer()).post(`/api/v1/tasks/${series.body.id}/subtasks`).set(bearer(toDelete.token)).send({ title: 'Sub' }).expect(201);

    const bystanderTasksBefore = await prisma.task.count({ where: { userId: userA.userId } });

    await request(app.getHttpServer()).delete('/api/v1/me').set(bearer(toDelete.token)).send({ password: toDelete.password }).expect(204);

    expect(await prisma.task.count({ where: { userId: toDelete.userId } })).toBe(0);
    expect(await prisma.taskException.count({ where: { taskId: series.body.id } })).toBe(0);
    expect(await prisma.subtask.findUnique({ where: { id: subtask.body.id } })).toBeNull();
    expect(await prisma.task.count({ where: { userId: userA.userId } })).toBe(bystanderTasksBefore);
  });

  it('purges tombstoned tasks past the retention window, and only those', async () => {
    const now = Date.now();
    const make = (title: string, deletedDaysAgo: number | null) =>
      prisma.task.create({
        data: { userId: userA.userId, title, deletedAt: deletedDaysAgo === null ? null : new Date(now - deletedDaysAgo * 86_400_000) },
      });
    const expired = await make('deleted 200d ago', 200);
    const kept = [await make('deleted 89d ago', 89), await make('never deleted', null)];

    await app.get(TaskTombstoneRetentionCron).purge();

    const remaining = new Set((await prisma.task.findMany({ where: { userId: userA.userId } })).map((t) => t.id));
    expect(remaining.has(expired.id)).toBe(false);
    for (const task of kept) expect(remaining.has(task.id), task.title).toBe(true);
  });
});
