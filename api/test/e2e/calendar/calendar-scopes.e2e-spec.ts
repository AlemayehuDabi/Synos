import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../src/lib/prisma.js';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';

describe('Calendar: recurrence edit/delete scopes (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let prisma: PrismaService;
  let user: TestUser;

  const create = (body: Record<string, unknown>) => request(app.getHttpServer()).post('/api/v1/calendar/events').set(bearer(user.token)).send(body).expect(201);
  const patch = (id: string, body: Record<string, unknown>) => request(app.getHttpServer()).patch(`/api/v1/calendar/events/${id}`).set(bearer(user.token)).send(body);
  const del = (id: string, query: Record<string, string> = {}) => request(app.getHttpServer()).delete(`/api/v1/calendar/events/${id}`).query(query).set(bearer(user.token));
  const view = (from: string, to: string) => request(app.getHttpServer()).get('/api/v1/calendar/view').query({ from, to }).set(bearer(user.token)).expect(200);

  const weeklySeries = (overrides: Record<string, unknown> = {}) =>
    create({
      title: 'Standup',
      startsAt: '2026-09-07T09:00:00Z', // Monday
      endsAt: '2026-09-07T09:30:00Z',
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
    it('rejects it on a non-recurring event', async () => {
      const single = await create({ title: 'Once', startsAt: '2026-09-22T09:00:00Z', endsAt: '2026-09-22T10:00:00Z', timezone: 'UTC' });
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

      const res = await patch(series.body.id, { scope: 'this', occurrenceStart, title: 'Standup (special)', location: 'Room B' }).expect(200);
      expect(res.body).toMatchObject({ eventId: series.body.id, originalStart: new Date(occurrenceStart).toISOString(), title: 'Standup (special)', location: 'Room B', modified: true });

      const { body } = await view('2026-09-07', '2026-09-21');
      const events = body.items.filter((i: { kind: string }) => i.kind === 'event' && i.eventId === series.body.id);
      expect(events).toHaveLength(3);
      expect(events.find((e: { originalStart: string }) => e.originalStart === occurrenceStart)).toMatchObject({ title: 'Standup (special)', location: 'Room B', modified: true });
      expect(events.filter((e: { modified: boolean }) => !e.modified)).toHaveLength(2);

      const master = await request(app.getHttpServer()).get(`/api/v1/calendar/events/${series.body.id}`).set(bearer(user.token)).expect(200);
      expect(master.body.title).toBe('Standup');
    });

    it('can move an occurrence to a different time, and it is found there', async () => {
      const series = await weeklySeries();
      const occurrenceStart = new Date('2026-09-21T09:00:00Z').toISOString();
      await patch(series.body.id, {
        scope: 'this',
        occurrenceStart,
        startsAt: '2026-09-22T14:00:00Z', // moved to Tuesday afternoon
        endsAt: '2026-09-22T15:00:00Z',
      }).expect(200);

      const { body } = await view('2026-09-21', '2026-09-23');
      const moved = body.items.find((i: { kind: string; eventId: string; originalStart: string }) => i.kind === 'event' && i.eventId === series.body.id && i.originalStart === new Date(occurrenceStart).toISOString());
      expect(moved).toMatchObject({ startsAt: '2026-09-22T14:00:00.000Z', endsAt: '2026-09-22T15:00:00.000Z' });
    });

    it('requires startsAt and endsAt together', async () => {
      const series = await weeklySeries();
      await patch(series.body.id, { scope: 'this', occurrenceStart: '2026-09-07T09:00:00Z', startsAt: '2026-09-07T10:00:00Z' }).expect(400);
    });

    it('rejects allDay, timezone, rrule and source, which only make sense series-wide', async () => {
      const series = await weeklySeries();
      for (const field of [{ allDay: true }, { timezone: 'UTC' }, { rrule: 'FREQ=DAILY' }, { source: 'sync' }]) {
        await patch(series.body.id, { scope: 'this', occurrenceStart: '2026-09-07T09:00:00Z', ...field }).expect(400);
      }
    });

    it('is idempotent: applying the same change twice keeps one exception row', async () => {
      const series = await weeklySeries();
      const occurrenceStart = new Date('2026-09-28T09:00:00Z').toISOString();
      await patch(series.body.id, { scope: 'this', occurrenceStart, title: 'Twice' }).expect(200);
      await patch(series.body.id, { scope: 'this', occurrenceStart, title: 'Twice' }).expect(200);
      expect(await prisma.calendarEventException.count({ where: { eventId: series.body.id, originalStart: new Date(occurrenceStart) } })).toBe(1);
    });

    it('cancels exactly one occurrence on delete, leaving the series and the other occurrences', async () => {
      const series = await weeklySeries();
      const occurrenceStart = new Date('2026-09-14T09:00:00Z').toISOString();
      await del(series.body.id, { scope: 'this', occurrenceStart }).expect(204);

      const { body } = await view('2026-09-07', '2026-09-21');
      const events = body.items.filter((i: { kind: string; eventId: string }) => i.kind === 'event' && i.eventId === series.body.id);
      expect(events).toHaveLength(2);
      expect(events.some((e: { originalStart: string }) => e.originalStart === occurrenceStart)).toBe(false);

      const master = await request(app.getHttpServer()).get(`/api/v1/calendar/events/${series.body.id}`).set(bearer(user.token)).expect(200);
      expect(master.body).toBeTruthy(); // the series itself is untouched
    });
  });

  describe('scope "following"', () => {
    it('truncates the original series and creates a new one from the split point, carrying the change', async () => {
      const series = await weeklySeries();
      const splitAt = new Date('2026-09-21T09:00:00Z').toISOString(); // third Monday

      const res = await patch(series.body.id, { scope: 'following', occurrenceStart: splitAt, title: 'Standup v2', location: 'Room C' }).expect(200);
      expect(res.body).toMatchObject({ title: 'Standup v2', location: 'Room C', rrule: 'FREQ=WEEKLY;BYDAY=MO', startsAt: new Date(splitAt).toISOString() });
      expect(res.body.id).not.toBe(series.body.id);

      const original = await request(app.getHttpServer()).get(`/api/v1/calendar/events/${series.body.id}`).set(bearer(user.token)).expect(200);
      expect(original.body.title).toBe('Standup');
      expect(original.body.seriesUntil).toBe(new Date(new Date(splitAt).getTime() - 1).toISOString());

      const { body } = await view('2026-09-07', '2026-10-05');
      const beforeSplit = body.items.filter((i: { kind: string; eventId: string }) => i.kind === 'event' && i.eventId === series.body.id);
      const afterSplit = body.items.filter((i: { kind: string; eventId: string }) => i.kind === 'event' && i.eventId === res.body.id);
      expect(beforeSplit.map((e: { originalStart: string }) => e.originalStart)).toEqual(['2026-09-07T09:00:00.000Z', '2026-09-14T09:00:00.000Z']);
      expect(afterSplit.every((e: { title: string }) => e.title === 'Standup v2')).toBe(true);
      expect(afterSplit.length).toBeGreaterThanOrEqual(3);
    });

    it('carries a "this"-scoped exception on a later occurrence forward to the new series', async () => {
      const series = await weeklySeries();
      const laterOccurrence = new Date('2026-10-05T09:00:00Z').toISOString();
      await patch(series.body.id, { scope: 'this', occurrenceStart: laterOccurrence, title: 'Special' }).expect(200);

      const splitAt = new Date('2026-09-21T09:00:00Z').toISOString();
      const split = await patch(series.body.id, { scope: 'following', occurrenceStart: splitAt, location: 'New room' }).expect(200);

      const { body } = await view('2026-10-01', '2026-10-10');
      const carried = body.items.find((i: { kind: string; eventId: string }) => i.kind === 'event' && i.eventId === split.body.id);
      expect(carried).toMatchObject({ title: 'Special', location: 'New room', modified: true });
    });

    it('drops an exception that no longer matches after the pattern itself changes', async () => {
      const series = await weeklySeries();
      const laterOccurrence = new Date('2026-10-05T09:00:00Z').toISOString(); // a Monday
      await patch(series.body.id, { scope: 'this', occurrenceStart: laterOccurrence, title: 'Special' }).expect(200);

      const splitAt = new Date('2026-09-21T09:00:00Z').toISOString();
      // Switch Mondays to Tuesdays from the split onward: the old Monday exception no longer applies.
      const split = await patch(series.body.id, { scope: 'following', occurrenceStart: splitAt, rrule: 'FREQ=WEEKLY;BYDAY=TU' }).expect(200);

      const { body } = await view('2026-10-01', '2026-10-10');
      const items = body.items.filter((i: { kind: string; eventId: string }) => i.kind === 'event' && i.eventId === split.body.id);
      expect(items.every((i: { title: string }) => i.title === 'Standup')).toBe(true); // no "Special" survived
      expect(items.every((i: { originalStart: string }) => new Date(i.originalStart).getUTCDay() === 2)).toBe(true); // all now Tuesdays
    });

    it('is equivalent to scope "all" when the split point is the series\' own first occurrence', async () => {
      const series = await weeklySeries();
      const res = await patch(series.body.id, { scope: 'following', occurrenceStart: '2026-09-07T09:00:00Z', title: 'Whole series renamed' }).expect(200);
      expect(res.body.id).toBe(series.body.id); // no split happened
      expect(res.body.title).toBe('Whole series renamed');
    });

    it('deletes this and every following occurrence, keeping earlier ones', async () => {
      const series = await weeklySeries();
      const splitAt = new Date('2026-09-21T09:00:00Z').toISOString();
      await del(series.body.id, { scope: 'following', occurrenceStart: splitAt }).expect(204);

      const { body } = await view('2026-09-07', '2026-10-05');
      const remaining = body.items.filter((i: { kind: string; eventId: string }) => i.kind === 'event' && i.eventId === series.body.id);
      expect(remaining.map((e: { originalStart: string }) => e.originalStart)).toEqual(['2026-09-07T09:00:00.000Z', '2026-09-14T09:00:00.000Z']);
    });

    it('tombstones the whole event when "following" is deleted from its own first occurrence', async () => {
      const series = await weeklySeries();
      await del(series.body.id, { scope: 'following', occurrenceStart: '2026-09-07T09:00:00Z' }).expect(204);
      await request(app.getHttpServer()).get(`/api/v1/calendar/events/${series.body.id}`).set(bearer(user.token)).expect(404);
    });
  });

  describe('scope "all" on a recurring series', () => {
    it('updates every occurrence, past and future', async () => {
      const series = await weeklySeries();
      await patch(series.body.id, { title: 'Renamed everywhere' }).expect(200); // scope defaults to "all"

      const { body } = await view('2026-09-07', '2026-10-05');
      const items = body.items.filter((i: { kind: string; eventId: string }) => i.kind === 'event' && i.eventId === series.body.id);
      expect(items.every((i: { title: string }) => i.title === 'Renamed everywhere')).toBe(true);
    });

    it('drops exceptions that no longer match a changed pattern, keeps the ones that still do', async () => {
      const series = await weeklySeries();
      const kept = new Date('2026-09-07T09:00:00Z').toISOString(); // will still be a Monday-matching slot after BYDAY stays MO... use a real change instead
      await patch(series.body.id, { scope: 'this', occurrenceStart: kept, title: 'Kept special' }).expect(200);

      // Move the whole series' weekday: the old Monday exception no longer matches.
      await patch(series.body.id, { rrule: 'FREQ=WEEKLY;BYDAY=TU' }).expect(200);
      expect(await prisma.calendarEventException.count({ where: { eventId: series.body.id } })).toBe(0);
    });

    it('keeps a still-matching exception through an unrelated field change', async () => {
      const series = await weeklySeries();
      const occurrenceStart = new Date('2026-09-07T09:00:00Z').toISOString();
      await patch(series.body.id, { scope: 'this', occurrenceStart, title: 'Kept special' }).expect(200);

      await patch(series.body.id, { location: 'New default room' }).expect(200);
      expect(await prisma.calendarEventException.count({ where: { eventId: series.body.id } })).toBe(1);

      const { body } = await view('2026-09-07', '2026-09-08');
      const item = body.items.find((i: { kind: string; eventId: string }) => i.kind === 'event' && i.eventId === series.body.id);
      expect(item).toMatchObject({ title: 'Kept special', modified: true }); // exception's own title wins
    });

    it('turns a recurring event into a single one when rrule is set to null, and it then rejects scope "this"/"following"', async () => {
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

    it('deletes the entire series with all its occurrences', async () => {
      const series = await weeklySeries();
      await del(series.body.id).expect(204);
      const { body } = await view('2026-09-07', '2026-10-05');
      expect(body.items.some((i: { kind: string; eventId: string }) => i.kind === 'event' && i.eventId === series.body.id)).toBe(false);
    });

    it('rejects an unknown scope value', async () => {
      const series = await weeklySeries();
      await patch(series.body.id, { scope: 'everything', title: 'x' }).expect(400);
    });
  });
});
