import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../src/lib/prisma.js';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';

describe('Tasks: complete/reopen/skip lifecycle (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let prisma: PrismaService;
  let user: TestUser;

  const create = (body: Record<string, unknown>) => request(app.getHttpServer()).post('/api/v1/tasks').set(bearer(user.token)).send(body).expect(201);
  const complete = (id: string, body: Record<string, unknown> = {}) => request(app.getHttpServer()).post(`/api/v1/tasks/${id}/complete`).set(bearer(user.token)).send(body);
  const reopen = (id: string) => request(app.getHttpServer()).post(`/api/v1/tasks/${id}/reopen`).set(bearer(user.token)).send({});
  const skip = (id: string, body: Record<string, unknown> = {}) => request(app.getHttpServer()).post(`/api/v1/tasks/${id}/skip`).set(bearer(user.token)).send(body);

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    prisma = app.get(PrismaService);
    user = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('completing a non-recurring task', () => {
    it('marks it completed and sets completedAt', async () => {
      const task = await create({ title: 'Once' });
      const res = await complete(task.body.id).expect(200);
      expect(res.body.status).toBe('completed');
      expect(res.body.completedAt).toEqual(expect.any(String));
    });

    it('records actualMinutes and sets the estimate outright when there was none', async () => {
      const task = await create({ title: 'Timed' });
      const res = await complete(task.body.id, { actualMinutes: 45 }).expect(200);
      expect(res.body.actualMinutes).toBe(45);
      expect(res.body.estimatedMinutes).toBe(45);
    });

    it('blends actualMinutes into an existing estimate via EMA', async () => {
      const task = await create({ title: 'Estimated', estimatedMinutes: 30 });
      const res = await complete(task.body.id, { actualMinutes: 60 }).expect(200);
      expect(res.body.estimatedMinutes).toBe(Math.round(0.3 * 60 + 0.7 * 30));
    });

    it('creates a TaskCompletion history row', async () => {
      const task = await create({ title: 'History' });
      await complete(task.body.id, { actualMinutes: 20 }).expect(200);
      const row = await prisma.taskCompletion.findFirst({ where: { taskId: task.body.id } });
      expect(row).toMatchObject({ taskId: task.body.id, userId: user.userId, actualMinutes: 20 });
    });

    it('rejects completing an already-completed task with 409', async () => {
      const task = await create({ title: 'Twice' });
      await complete(task.body.id).expect(200);
      await complete(task.body.id).expect(409);
    });

    it('is 404 for another user\'s task', async () => {
      const other = await signUpAndVerify(app, sentMails);
      const task = await create({ title: 'Mine' });
      await request(app.getHttpServer()).post(`/api/v1/tasks/${task.body.id}/complete`).set(bearer(other.token)).send({}).expect(404);
    });

    it('replays an Idempotency-Key instead of completing twice', async () => {
      const task = await create({ title: 'Idempotent complete' });
      const key = { 'Idempotency-Key': `complete-${task.body.id}` };
      const first = await request(app.getHttpServer()).post(`/api/v1/tasks/${task.body.id}/complete`).set(bearer(user.token)).set(key).send({}).expect(200);
      const replay = await request(app.getHttpServer()).post(`/api/v1/tasks/${task.body.id}/complete`).set(bearer(user.token)).set(key).send({}).expect(200);
      expect(replay.body).toEqual(first.body);
    });
  });

  describe('reopening a task', () => {
    it('sets it back to open and clears completedAt', async () => {
      const task = await create({ title: 'Reopen me' });
      await complete(task.body.id).expect(200);
      const res = await reopen(task.body.id).expect(200);
      expect(res.body.status).toBe('open');
      expect(res.body.completedAt).toBeNull();
    });

    it('rejects reopening a task that is not completed with 409', async () => {
      const task = await create({ title: 'Still open' });
      await reopen(task.body.id).expect(409);
    });

    it('is 404 for another user\'s task', async () => {
      const other = await signUpAndVerify(app, sentMails);
      const task = await create({ title: 'Mine' });
      await complete(task.body.id).expect(200);
      await request(app.getHttpServer()).post(`/api/v1/tasks/${task.body.id}/reopen`).set(bearer(other.token)).send({}).expect(404);
    });
  });

  describe('completing a recurring task (rolling occurrence)', () => {
    it('rolls dueAt forward to the next occurrence and stays open', async () => {
      const series = await create({ title: 'Weekly', dueAt: '2026-09-07T09:00:00Z', timezone: 'UTC', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
      const res = await complete(series.body.id).expect(200);
      expect(res.body.status).toBe('open');
      expect(res.body.dueAt).toBe('2026-09-14T09:00:00.000Z');
    });

    it('carries the schedule offset forward when scheduled', async () => {
      const series = await create({
        title: 'Weekly scheduled',
        dueAt: '2026-09-07T09:00:00Z',
        scheduledStart: '2026-09-07T09:00:00Z',
        scheduledEnd: '2026-09-07T09:30:00Z',
        timezone: 'UTC',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
      });
      const res = await complete(series.body.id).expect(200);
      expect(res.body.scheduledStart).toBe('2026-09-14T09:00:00.000Z');
      expect(res.body.scheduledEnd).toBe('2026-09-14T09:30:00.000Z');
    });

    it('updates the EMA estimate per recurringGroupId across roll-forwards', async () => {
      const series = await create({ title: 'Weekly estimated', dueAt: '2026-09-07T09:00:00Z', timezone: 'UTC', rrule: 'FREQ=WEEKLY;BYDAY=MO', estimatedMinutes: 30 });
      const first = await complete(series.body.id, { actualMinutes: 60 }).expect(200);
      expect(first.body.estimatedMinutes).toBe(Math.round(0.3 * 60 + 0.7 * 30));
      const second = await complete(series.body.id, { actualMinutes: 60 }).expect(200);
      expect(second.body.estimatedMinutes).toBe(Math.round(0.3 * 60 + 0.7 * first.body.estimatedMinutes));
    });

    it('marks the whole task completed once the series ends (seriesUntil via COUNT)', async () => {
      const series = await create({ title: 'Two occurrences', dueAt: '2026-09-07T09:00:00Z', timezone: 'UTC', rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=2' });
      const rolled = await complete(series.body.id).expect(200);
      expect(rolled.body.status).toBe('open');
      const done = await complete(series.body.id).expect(200);
      expect(done.body.status).toBe('completed');
    });

    it('absorbs a pre-planned "this"-scoped exception waiting at the new current occurrence', async () => {
      const series = await create({ title: 'Pre-planned', dueAt: '2026-09-07T09:00:00Z', timezone: 'UTC', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
      await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${series.body.id}`)
        .set(bearer(user.token))
        .send({ scope: 'this', occurrenceStart: '2026-09-14T09:00:00Z', title: 'Special next week' })
        .expect(200);

      const rolled = await complete(series.body.id).expect(200);
      expect(rolled.body.title).toBe('Special next week');
      expect(rolled.body.dueAt).toBe('2026-09-14T09:00:00.000Z');
      // The exception is absorbed into the master, not left dangling.
      expect(await prisma.taskException.count({ where: { taskId: series.body.id } })).toBe(0);
    });

    it('skips over a pre-skipped occurrence when rolling forward', async () => {
      const series = await create({ title: 'Skip-ahead', dueAt: '2026-09-07T09:00:00Z', timezone: 'UTC', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
      await request(app.getHttpServer())
        .delete(`/api/v1/tasks/${series.body.id}`)
        .query({ scope: 'this', occurrenceStart: '2026-09-14T09:00:00Z' })
        .set(bearer(user.token))
        .expect(204);

      const rolled = await complete(series.body.id).expect(200);
      expect(rolled.body.dueAt).toBe('2026-09-21T09:00:00.000Z'); // Sep 14 was pre-skipped
    });

    it('keeps the schedule offset correct when rolling forward across a pre-skipped occurrence', async () => {
      const series = await create({
        title: 'Skip-ahead scheduled',
        dueAt: '2026-09-07T09:00:00Z',
        scheduledStart: '2026-09-07T09:00:00Z',
        scheduledEnd: '2026-09-07T09:30:00Z',
        timezone: 'UTC',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
      });
      await request(app.getHttpServer())
        .delete(`/api/v1/tasks/${series.body.id}`)
        .query({ scope: 'this', occurrenceStart: '2026-09-14T09:00:00Z' })
        .set(bearer(user.token))
        .expect(204);

      const rolled = await complete(series.body.id).expect(200);
      expect(rolled.body.dueAt).toBe('2026-09-21T09:00:00.000Z'); // Sep 14 was pre-skipped
      expect(rolled.body.scheduledStart).toBe('2026-09-21T09:00:00.000Z'); // schedule kept pace, not left at Sep 7
      expect(rolled.body.scheduledEnd).toBe('2026-09-21T09:30:00.000Z');

      // Roll forward once more, from a self-consistent (dueAt, scheduledStart) pair this time.
      const rolledAgain = await complete(series.body.id).expect(200);
      expect(rolledAgain.body.dueAt).toBe('2026-09-28T09:00:00.000Z');
      expect(rolledAgain.body.scheduledStart).toBe('2026-09-28T09:00:00.000Z');
    });
  });

  describe('skipping an occurrence', () => {
    it('rejects a task with no dueAt', async () => {
      const task = await create({ title: 'No due date' });
      await skip(task.body.id).expect(400);
    });

    it('defaults to the current occurrence, creates an exception, and rolls dueAt forward', async () => {
      const series = await create({ title: 'Skip current', dueAt: '2026-09-07T09:00:00Z', timezone: 'UTC', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
      const res = await skip(series.body.id).expect(200);
      expect(res.body.dueAt).toBe('2026-09-14T09:00:00.000Z');
      expect(await prisma.taskException.findFirst({ where: { taskId: series.body.id, originalDueAt: new Date('2026-09-07T09:00:00Z') } })).toMatchObject({ kind: 'skipped' });
    });

    it('skips a future occurrence explicitly without moving the current dueAt', async () => {
      const series = await create({ title: 'Skip future', dueAt: '2026-09-07T09:00:00Z', timezone: 'UTC', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
      const res = await skip(series.body.id, { occurrenceStart: '2026-09-14T09:00:00Z' }).expect(200);
      expect(res.body.dueAt).toBe('2026-09-07T09:00:00.000Z'); // unchanged
      expect(await prisma.taskException.findFirst({ where: { taskId: series.body.id, originalDueAt: new Date('2026-09-14T09:00:00Z') } })).toMatchObject({ kind: 'skipped' });
    });

    it('rejects an occurrenceStart that is not a real occurrence', async () => {
      const series = await create({ title: 'Bad skip', dueAt: '2026-09-07T09:00:00Z', timezone: 'UTC', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
      await skip(series.body.id, { occurrenceStart: '2026-09-08T09:00:00Z' }).expect(400); // Tuesday
    });

    it('works on a non-recurring task\'s own dueAt too, tombstoning nothing but leaving status open with dueAt unchanged (no next occurrence)', async () => {
      const single = await create({ title: 'Single skip', dueAt: '2026-09-07T09:00:00Z', timezone: 'UTC' });
      const res = await skip(single.body.id).expect(200);
      expect(res.body.dueAt).toBe('2026-09-07T09:00:00.000Z');
      expect(await prisma.taskException.findFirst({ where: { taskId: single.body.id } })).toMatchObject({ kind: 'skipped' });
    });

    it('is 404 for another user\'s task', async () => {
      const other = await signUpAndVerify(app, sentMails);
      const series = await create({ title: 'Mine', dueAt: '2026-09-07T09:00:00Z', timezone: 'UTC', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
      await request(app.getHttpServer()).post(`/api/v1/tasks/${series.body.id}/skip`).set(bearer(other.token)).send({}).expect(404);
    });
  });
});
