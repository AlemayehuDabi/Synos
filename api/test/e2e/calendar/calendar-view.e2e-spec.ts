import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CALENDAR_VIEW_HORIZON_DAYS, CALENDAR_VIEW_MAX_RANGE_DAYS } from '../../../src/calendar/calendar-range.js';
import { SandboxCalendarBlockFaultsModule, SandboxCalendarBlockModule } from '../../sandbox/calendar-block-contributors.js';
import { sandboxState } from '../../sandbox/sandbox-state.js';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser, updateSettings } from '../helpers.js';

describe('Calendar: GET /calendar/view (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let userA: TestUser;
  let userB: TestUser;

  const create = (user: TestUser, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/v1/calendar/events').set(bearer(user.token)).send(body).expect(201);
  const view = (user: TestUser, query: Record<string, string>) =>
    request(app.getHttpServer()).get('/api/v1/calendar/view').query(query).set(bearer(user.token));

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp([SandboxCalendarBlockModule, SandboxCalendarBlockFaultsModule]));
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    sandboxState.reset();
    vi.restoreAllMocks();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/v1/calendar/view').query({ from: '2026-09-01', to: '2026-09-02' }).expect(401);
  });

  it('merges events and soft blocks, sorted by start, each tagged with its kind', async () => {
    const event = await create(userA, { title: 'Standup', startsAt: '2026-09-22T09:00:00Z', endsAt: '2026-09-22T09:30:00Z', timezone: 'UTC' });
    sandboxState.calendarBlocksByUser.set(userA.userId, [
      { id: 'blk-1', domain: 'tasks', title: 'Deep work', startsAt: '2026-09-22T10:00:00Z', endsAt: '2026-09-22T11:00:00Z', allDay: false, busy: true },
    ]);

    const res = await view(userA, { from: '2026-09-22', to: '2026-09-22' }).expect(200);
    expect(res.body).toMatchObject({ from: '2026-09-22', to: '2026-09-22', timezone: 'UTC' });
    expect(res.body.items.map((i: { kind: string; title: string }) => [i.kind, i.title])).toEqual([
      ['event', 'Standup'],
      ['block', 'Deep work'],
    ]);
    expect(res.body.items[0]).toMatchObject({ eventId: event.body.id, allDay: false, modified: false });
    expect(res.body.items[1]).toMatchObject({ id: 'blk-1', domain: 'tasks', busy: true });
  });

  it('reports every registered contributor\'s status, and a healthy one never blocks a failing one', async () => {
    const res = await view(userA, { from: '2026-09-22', to: '2026-09-22' }).expect(200);
    const byDomain = Object.fromEntries(res.body.contributors.map((c: { domain: string; status: string }) => [c.domain, c.status]));
    expect(byDomain).toEqual({ tasks: 'ok', habits: 'error', finances: 'timeout', meals: 'error' });
  });

  it('never leaks what a failing contributor returned or threw, in the response or the logs', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const res = await view(userA, { from: '2026-09-22', to: '2026-09-22' }).expect(200);
    expect(JSON.stringify(res.body)).not.toContain('SECRET-BLOCK-PAYLOAD');
    const logged = warn.mock.calls.map((call) => String(call[0]));
    expect(logged.some((line) => line.includes('"habits"') && line.includes(userA.userId))).toBe(true);
    expect(logged.some((line) => line.includes('"finances"') && line.includes('timed out'))).toBe(true);
    expect(logged.join('\n')).not.toContain('SECRET-BLOCK-PAYLOAD');
  });

  it('gives every contributor the resolved date range and the caller\'s timezone', async () => {
    await updateSettings(app, userA.token, { timezone: 'Africa/Nairobi' });
    await view(userA, { from: '2026-09-22', to: '2026-09-23' }).expect(200);
    const ctx = sandboxState.calendarBlockContexts.at(-1)!;
    expect(ctx).toMatchObject({ userId: userA.userId, timezone: 'Africa/Nairobi' });
    expect(ctx.from.toISOString()).toBe('2026-09-21T21:00:00.000Z');
    expect(ctx.to.toISOString()).toBe('2026-09-23T21:00:00.000Z');
    await updateSettings(app, userA.token, { timezone: 'UTC' });
  });

  it('accepts an explicit timezone override without touching the user\'s own settings', async () => {
    const res = await view(userA, { from: '2026-09-22', to: '2026-09-22', timezone: 'America/New_York' }).expect(200);
    expect(res.body.timezone).toBe('America/New_York');
    const settled = await request(app.getHttpServer()).get('/api/v1/me/settings').set(bearer(userA.token)).expect(200);
    expect(settled.body.timezone).toBe('UTC');
  });

  it('excludes a tombstoned (deleted) event', async () => {
    const event = await create(userA, { title: 'ToDelete', startsAt: '2026-09-22T09:00:00Z', endsAt: '2026-09-22T10:00:00Z', timezone: 'UTC' });
    await request(app.getHttpServer()).delete(`/api/v1/calendar/events/${event.body.id}`).set(bearer(userA.token)).expect(204);

    const res = await view(userA, { from: '2026-09-22', to: '2026-09-22' }).expect(200);
    expect(res.body.items.some((i: { eventId?: string }) => i.eventId === event.body.id)).toBe(false);
  });

  it('excludes a cancelled occurrence but keeps the rest of the series', async () => {
    const series = await create(userA, { title: 'Weekly', startsAt: '2026-09-07T09:00:00Z', endsAt: '2026-09-07T09:30:00Z', timezone: 'UTC', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
    await request(app.getHttpServer())
      .delete(`/api/v1/calendar/events/${series.body.id}`)
      .query({ scope: 'this', occurrenceStart: '2026-09-14T09:00:00Z' })
      .set(bearer(userA.token))
      .expect(204);

    const res = await view(userA, { from: '2026-09-07', to: '2026-09-21' }).expect(200);
    const occurrences = res.body.items.filter((i: { kind: string; eventId?: string }) => i.kind === 'event' && i.eventId === series.body.id);
    expect(occurrences).toHaveLength(2);
    expect(occurrences.map((o: { originalStart: string }) => o.originalStart)).toEqual(['2026-09-07T09:00:00.000Z', '2026-09-21T09:00:00.000Z']);
  });

  it('only ever shows a user their own events and their own contributors\' blocks', async () => {
    await create(userA, { title: 'Mine', startsAt: '2026-09-22T09:00:00Z', endsAt: '2026-09-22T10:00:00Z', timezone: 'UTC' });
    sandboxState.calendarBlocksByUser.set(userA.userId, [{ id: 'a1', domain: 'tasks', title: 'A block', startsAt: '2026-09-22T11:00:00Z', endsAt: '2026-09-22T12:00:00Z', allDay: false, busy: true }]);

    const forB = await view(userB, { from: '2026-09-22', to: '2026-09-22' }).expect(200);
    expect(forB.body.items.some((i: { title: string }) => i.title === 'Mine' || i.title === 'A block')).toBe(false);
  });

  it('rejects `to` before `from`, and a range wider than the maximum', async () => {
    await view(userA, { from: '2026-09-22', to: '2026-09-21' }).expect(400);
    const wide = new Date(Date.now() + (CALENDAR_VIEW_MAX_RANGE_DAYS + 5) * 86_400_000).toISOString().slice(0, 10);
    await view(userA, { from: new Date().toISOString().slice(0, 10), to: wide }).expect(400);
  });

  it('rejects a date range far from today', async () => {
    const farFuture = new Date(Date.now() + (CALENDAR_VIEW_HORIZON_DAYS + 30) * 86_400_000).toISOString().slice(0, 10);
    await view(userA, { from: farFuture, to: farFuture }).expect(400);
  });

  it('rejects malformed dates, a bad timezone, and unknown query parameters', async () => {
    await view(userA, { from: 'not-a-date', to: '2026-09-22' }).expect(400);
    await view(userA, { from: '2026-09-22', to: '2026-09-22', timezone: 'Not/AZone' }).expect(400);
    await view(userA, { from: '2026-09-22', to: '2026-09-22', extra: 'nope' }).expect(400);
  });
});
