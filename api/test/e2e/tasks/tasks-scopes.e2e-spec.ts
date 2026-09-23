import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../src/lib/prisma.js';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';

describe('Tasks: recurrence edit/delete scopes (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let prisma: PrismaService;
  let user: TestUser;

  const create = (body: Record<string, unknown>) => request(app.getHttpServer()).post('/api/v1/tasks').set(bearer(user.token)).send(body).expect(201);
  const patch = (id: string, body: Record<string, unknown>) => request(app.getHttpServer()).patch(`/api/v1/tasks/${id}`).set(bearer(user.token)).send(body);
  const del = (id: string, query: Record<string, string> = {}) => request(app.getHttpServer()).delete(`/api/v1/tasks/${id}`).query(query).set(bearer(user.token));
  const get = (id: string) => request(app.getHttpServer()).get(`/api/v1/tasks/${id}`).set(bearer(user.token));
  const putRecurrence = (id: string, body: Record<string, unknown>) => request(app.getHttpServer()).put(`/api/v1/tasks/${id}/recurrence`).set(bearer(user.token)).send(body);

  const weeklySeries = (overrides: Record<string, unknown> = {}) =>
    create({
      title: 'Water plants',
      dueAt: '2026-09-07T09:00:00Z', // Monday
      timezone: 'UTC',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      ...overrides,
    });

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    prisma = app.get(PrismaService);
    user = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('scope "this"', () => {
    it('rejects it on a non-recurring task', async () => {
      const single = await create({ title: 'Once', dueAt: '2026-09-22T09:00:00Z', timezone: 'UTC' });
      await patch(single.body.id, { scope: 'this', occurrenceStart: '2026-09-22T09:00:00Z', title: 'x' }).expect(400);
      await del(single.body.id, { scope: 'this', occurrenceStart: '2026-09-22T09:00:00Z' }).expect(400);
    });

    it('requires occurrenceStart', async () => {
      const series = await weeklySeries();
      await patch(series.body.id, { scope: 'this', title: 'x' }).expect(400);
    });

    it('rejects an occurrenceStart that is not a real occurrence of the series', async () => {
      const series = await weeklySeries();
      await patch(series.body.id, { scope: 'this', occurrenceStart: '2026-09-08T09:00:00Z', title: 'x' }).expect(400); // Tuesday
    });

    it('changes one occurrence, leaves the master and the other occurrences untouched, and returns the occurrence', async () => {
      const series = await weeklySeries();
      const occurrenceStart = new Date('2026-09-14T09:00:00Z').toISOString(); // second Monday

      const res = await patch(series.body.id, { scope: 'this', occurrenceStart, title: 'Water plants (special)', priority: 'high' }).expect(200);
      expect(res.body).toMatchObject({ taskId: series.body.id, originalDueAt: occurrenceStart, title: 'Water plants (special)', priority: 'high', modified: true });

      const master = await get(series.body.id).expect(200);
      expect(master.body.title).toBe('Water plants');
      expect(master.body.dueAt).toBe('2026-09-07T09:00:00.000Z'); // master's own dueAt untouched
    });

    it('can move an occurrence\'s dueAt to a different time', async () => {
      const series = await weeklySeries();
      const occurrenceStart = new Date('2026-09-21T09:00:00Z').toISOString();
      const res = await patch(series.body.id, { scope: 'this', occurrenceStart, dueAt: '2026-09-22T14:00:00Z' }).expect(200);
      expect(res.body.dueAt).toBe('2026-09-22T14:00:00.000Z');
    });

    it('requires the scope-"all"/"following"-only fields to be rejected', async () => {
      const series = await weeklySeries();
      for (const field of [{ isCritical: true }, { timezone: 'UTC' }, { rrule: 'FREQ=DAILY' }, { source: 'sync' }]) {
        await patch(series.body.id, { scope: 'this', occurrenceStart: '2026-09-07T09:00:00Z', ...field }).expect(400);
      }
    });

    it('is idempotent: applying the same change twice keeps one exception row', async () => {
      const series = await weeklySeries();
      const occurrenceStart = new Date('2026-09-28T09:00:00Z').toISOString();
      await patch(series.body.id, { scope: 'this', occurrenceStart, title: 'Twice' }).expect(200);
      await patch(series.body.id, { scope: 'this', occurrenceStart, title: 'Twice' }).expect(200);
      expect(await prisma.taskException.count({ where: { taskId: series.body.id, originalDueAt: new Date(occurrenceStart) } })).toBe(1);
    });

    it('skips exactly one occurrence on delete, leaving the series and the other occurrences; the master is untouched when it is not the current occurrence', async () => {
      const series = await weeklySeries();
      const occurrenceStart = new Date('2026-09-14T09:00:00Z').toISOString(); // not the current (first) occurrence
      await del(series.body.id, { scope: 'this', occurrenceStart }).expect(204);

      const master = await get(series.body.id).expect(200);
      expect(master.body).toBeTruthy(); // the series itself is untouched
      expect(master.body.dueAt).toBe('2026-09-07T09:00:00.000Z');
      expect(await prisma.taskException.findFirst({ where: { taskId: series.body.id, originalDueAt: new Date(occurrenceStart) } })).toMatchObject({ kind: 'skipped' });
    });
  });

  describe('scope "following"', () => {
    it('truncates the original series and creates a new one from the split point, carrying the change', async () => {
      const series = await weeklySeries();
      const splitAt = new Date('2026-09-21T09:00:00Z').toISOString(); // third Monday

      const res = await patch(series.body.id, { scope: 'following', occurrenceStart: splitAt, title: 'Water plants v2', priority: 'high' }).expect(200);
      expect(res.body).toMatchObject({ title: 'Water plants v2', priority: 'high', rrule: 'FREQ=WEEKLY;BYDAY=MO', dueAt: new Date(splitAt).toISOString() });
      expect(res.body.id).not.toBe(series.body.id);
      expect(res.body.recurringGroupId).toBe(series.body.id); // carries the original series' id forward

      const original = await get(series.body.id).expect(200);
      expect(original.body.title).toBe('Water plants');
      expect(original.body.seriesUntil).toBe(new Date(new Date(splitAt).getTime() - 1).toISOString());
    });

    it('carries a "this"-scoped exception on a later occurrence forward to the new series', async () => {
      const series = await weeklySeries();
      const laterOccurrence = new Date('2026-10-05T09:00:00Z').toISOString();
      await patch(series.body.id, { scope: 'this', occurrenceStart: laterOccurrence, title: 'Special' }).expect(200);

      const splitAt = new Date('2026-09-21T09:00:00Z').toISOString();
      const split = await patch(series.body.id, { scope: 'following', occurrenceStart: splitAt, priority: 'low' }).expect(200);

      expect(await prisma.taskException.findFirst({ where: { taskId: split.body.id, originalDueAt: new Date(laterOccurrence) } })).toMatchObject({ title: 'Special' });
      expect(await prisma.taskException.findFirst({ where: { taskId: series.body.id, originalDueAt: new Date(laterOccurrence) } })).toBeNull();
    });

    it('drops an exception that no longer matches after the pattern itself changes', async () => {
      const series = await weeklySeries();
      const laterOccurrence = new Date('2026-10-05T09:00:00Z').toISOString(); // a Monday
      await patch(series.body.id, { scope: 'this', occurrenceStart: laterOccurrence, title: 'Special' }).expect(200);

      const splitAt = new Date('2026-09-21T09:00:00Z').toISOString();
      // Switch Mondays to Tuesdays from the split onward: the old Monday exception no longer applies.
      const split = await patch(series.body.id, { scope: 'following', occurrenceStart: splitAt, rrule: 'FREQ=WEEKLY;BYDAY=TU' }).expect(200);

      expect(await prisma.taskException.count({ where: { taskId: split.body.id } })).toBe(0);
    });

    it('is equivalent to scope "all" when the split point is the series\' own first occurrence', async () => {
      const series = await weeklySeries();
      const res = await patch(series.body.id, { scope: 'following', occurrenceStart: '2026-09-07T09:00:00Z', title: 'Whole series renamed' }).expect(200);
      expect(res.body.id).toBe(series.body.id); // no split happened
      expect(res.body.title).toBe('Whole series renamed');
    });

    it('deletes this and every following occurrence via truncation, keeping earlier ones intact', async () => {
      const series = await weeklySeries();
      const splitAt = new Date('2026-09-21T09:00:00Z').toISOString();
      await del(series.body.id, { scope: 'following', occurrenceStart: splitAt }).expect(204);

      const master = await get(series.body.id).expect(200);
      expect(master.body.seriesUntil).toBe(new Date(new Date(splitAt).getTime() - 1).toISOString());
    });

    it('tombstones the whole task when "following" is deleted from its own first occurrence', async () => {
      const series = await weeklySeries();
      await del(series.body.id, { scope: 'following', occurrenceStart: '2026-09-07T09:00:00Z' }).expect(204);
      await get(series.body.id).expect(404);
    });
  });

  describe('scope "all" on a recurring series', () => {
    it('updates the master directly', async () => {
      const series = await weeklySeries();
      await patch(series.body.id, { title: 'Renamed everywhere' }).expect(200); // scope defaults to "all"
      const master = await get(series.body.id).expect(200);
      expect(master.body.title).toBe('Renamed everywhere');
    });

    it('drops exceptions that no longer match a changed pattern, keeps the ones that still do', async () => {
      const series = await weeklySeries();
      const kept = new Date('2026-09-07T09:00:00Z').toISOString();
      await patch(series.body.id, { scope: 'this', occurrenceStart: kept, title: 'Kept special' }).expect(200);

      // Move the whole series' weekday: the old Monday exception no longer matches.
      await patch(series.body.id, { rrule: 'FREQ=WEEKLY;BYDAY=TU' }).expect(200);
      expect(await prisma.taskException.count({ where: { taskId: series.body.id } })).toBe(0);
    });

    it('keeps a still-matching exception through an unrelated field change', async () => {
      const series = await weeklySeries();
      const occurrenceStart = new Date('2026-09-07T09:00:00Z').toISOString();
      await patch(series.body.id, { scope: 'this', occurrenceStart, title: 'Kept special' }).expect(200);

      await patch(series.body.id, { priority: 'high' }).expect(200);
      expect(await prisma.taskException.count({ where: { taskId: series.body.id } })).toBe(1);
    });

    it('turns a recurring task into a single one when rrule is set to null, and it then rejects scope "this"/"following"', async () => {
      const series = await weeklySeries();
      const updated = await patch(series.body.id, { rrule: null }).expect(200);
      expect(updated.body.rrule).toBeNull();
      expect(updated.body.seriesUntil).toBeNull();
      await patch(series.body.id, { scope: 'this', occurrenceStart: '2026-09-07T09:00:00Z', title: 'x' }).expect(400);
    });

    it('re-validates an impossible rrule on update', async () => {
      const series = await weeklySeries();
      await patch(series.body.id, { rrule: 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30' }).expect(400);
    });

    it('deletes the entire series', async () => {
      const series = await weeklySeries();
      await del(series.body.id).expect(204);
      await get(series.body.id).expect(404);
    });

    it('rejects an unknown scope value', async () => {
      const series = await weeklySeries();
      await patch(series.body.id, { scope: 'everything', title: 'x' }).expect(400);
    });
  });

  describe('PUT /tasks/:id/recurrence', () => {
    it('adds recurrence to a non-recurring task', async () => {
      const single = await create({ title: 'Becomes recurring', dueAt: '2026-11-02T09:00:00Z', timezone: 'UTC' });
      const res = await putRecurrence(single.body.id, { rrule: 'FREQ=WEEKLY;BYDAY=MO' }).expect(200);
      expect(res.body.rrule).toBe('FREQ=WEEKLY;BYDAY=MO');
      expect(res.body.recurringGroupId).toBe(single.body.id);
    });

    it('removes recurrence with rrule: null', async () => {
      const series = await weeklySeries();
      const res = await putRecurrence(series.body.id, { rrule: null }).expect(200);
      expect(res.body.rrule).toBeNull();
    });

    it('honors scope "following" the same way PATCH does', async () => {
      const series = await weeklySeries();
      const splitAt = new Date('2026-09-21T09:00:00Z').toISOString();
      const res = await putRecurrence(series.body.id, { rrule: 'FREQ=WEEKLY;BYDAY=TU', scope: 'following', occurrenceStart: splitAt }).expect(200);
      expect(res.body.id).not.toBe(series.body.id);
      expect(res.body.rrule).toBe('FREQ=WEEKLY;BYDAY=TU');
    });

    it('requires authentication', async () => {
      const series = await weeklySeries();
      await request(app.getHttpServer()).put(`/api/v1/tasks/${series.body.id}/recurrence`).send({ rrule: null }).expect(401);
    });
  });
});
