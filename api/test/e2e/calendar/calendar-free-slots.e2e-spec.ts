import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SandboxCalendarBlockModule } from '../../sandbox/calendar-block-contributors.js';
import { sandboxState } from '../../sandbox/sandbox-state.js';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';

describe('Calendar: GET /calendar/free-slots (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let userA: TestUser;
  let userB: TestUser;

  const create = (user: TestUser, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/v1/calendar/events').set(bearer(user.token)).send(body).expect(201);
  const freeSlots = (user: TestUser, query: Record<string, string>) =>
    request(app.getHttpServer()).get('/api/v1/calendar/free-slots').query(query).set(bearer(user.token));

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp([SandboxCalendarBlockModule]));
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => sandboxState.reset());

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/v1/calendar/free-slots').query({ from: '2026-09-01', to: '2026-09-01', duration: '30' }).expect(401);
  });

  it('is the whole day when nothing is busy', async () => {
    const res = await freeSlots(userA, { from: '2026-09-01', to: '2026-09-01', duration: '30' }).expect(200);
    expect(res.body).toEqual([{ startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-09-02T00:00:00.000Z' }]);
  });

  it('treats a calendar event as busy time', async () => {
    await create(userA, { title: 'Busy', startsAt: '2026-09-02T09:00:00Z', endsAt: '2026-09-02T10:00:00Z', timezone: 'UTC' });
    const res = await freeSlots(userA, { from: '2026-09-02', to: '2026-09-02', duration: '30' }).expect(200);
    expect(res.body).toEqual([
      { startsAt: '2026-09-02T00:00:00.000Z', endsAt: '2026-09-02T09:00:00.000Z' },
      { startsAt: '2026-09-02T10:00:00.000Z', endsAt: '2026-09-03T00:00:00.000Z' },
    ]);
  });

  it('treats a busy soft block as busy, and a non-busy one as not', async () => {
    sandboxState.calendarBlocksByUser.set(userA.userId, [
      { id: 'busy-1', domain: 'tasks', title: 'Focus', startsAt: '2026-09-03T11:00:00Z', endsAt: '2026-09-03T12:00:00Z', allDay: false, busy: true },
      { id: 'free-1', domain: 'tasks', title: 'Optional', startsAt: '2026-09-03T14:00:00Z', endsAt: '2026-09-03T15:00:00Z', allDay: false, busy: false },
    ]);
    const res = await freeSlots(userA, { from: '2026-09-03', to: '2026-09-03', duration: '30' }).expect(200);
    expect(res.body.some((s: { startsAt: string }) => s.startsAt === '2026-09-03T11:00:00.000Z')).toBe(false);
    expect(res.body.some((s: { startsAt: string; endsAt: string }) => s.startsAt <= '2026-09-03T14:00:00.000Z' && s.endsAt >= '2026-09-03T15:00:00.000Z')).toBe(true);
  });

  it('restricts to daily working hours when dayStart/dayEnd are given', async () => {
    const res = await freeSlots(userA, { from: '2026-09-04', to: '2026-09-04', duration: '30', dayStart: '09:00', dayEnd: '17:00' }).expect(200);
    expect(res.body).toEqual([{ startsAt: '2026-09-04T09:00:00.000Z', endsAt: '2026-09-04T17:00:00.000Z' }]);
  });

  it('excludes a slot shorter than the requested duration', async () => {
    await create(userA, { title: 'A', startsAt: '2026-09-05T09:00:00Z', endsAt: '2026-09-05T09:45:00Z', timezone: 'UTC' });
    await create(userA, { title: 'B', startsAt: '2026-09-05T10:00:00Z', endsAt: '2026-09-05T11:00:00Z', timezone: 'UTC' });
    const res = await freeSlots(userA, { from: '2026-09-05', to: '2026-09-05', duration: '30' }).expect(200);
    expect(res.body.some((s: { startsAt: string }) => s.startsAt === '2026-09-05T09:45:00.000Z')).toBe(false);
  });

  it('honours `limit`', async () => {
    for (const [start, end] of [['02:00', '03:00'], ['05:00', '06:00'], ['08:00', '09:00']]) {
      await create(userA, { title: 'x', startsAt: `2026-09-06T${start}:00Z`, endsAt: `2026-09-06T${end}:00Z`, timezone: 'UTC' });
    }
    const res = await freeSlots(userA, { from: '2026-09-06', to: '2026-09-06', duration: '1', limit: '2' }).expect(200);
    expect(res.body).toHaveLength(2);
  });

  it('only considers the caller\'s own events and blocks', async () => {
    await create(userA, { title: 'Mine', startsAt: '2026-09-07T09:00:00Z', endsAt: '2026-09-07T10:00:00Z', timezone: 'UTC' });
    const res = await freeSlots(userB, { from: '2026-09-07', to: '2026-09-07', duration: '60' }).expect(200);
    expect(res.body).toEqual([{ startsAt: '2026-09-07T00:00:00.000Z', endsAt: '2026-09-08T00:00:00.000Z' }]);
  });

  it('rejects dayStart without dayEnd, and dayStart at or after dayEnd', async () => {
    await freeSlots(userA, { from: '2026-09-08', to: '2026-09-08', duration: '30', dayStart: '09:00' }).expect(400);
    await freeSlots(userA, { from: '2026-09-08', to: '2026-09-08', duration: '30', dayStart: '17:00', dayEnd: '09:00' }).expect(400);
  });

  it('rejects a non-positive or missing duration, and a range past the limit', async () => {
    await freeSlots(userA, { from: '2026-09-08', to: '2026-09-08', duration: '0' }).expect(400);
    await freeSlots(userA, { from: '2026-09-08', to: '2026-09-08' }).expect(400);
    await freeSlots(userA, { from: '2026-01-01', to: '2026-03-10', duration: '30' }).expect(400);
  });
});
