import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';

describe('Calendar: event CRUD (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let userA: TestUser;
  let userB: TestUser;

  const create = (user: TestUser, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/v1/calendar/events').set(bearer(user.token)).send(body);
  const get = (user: TestUser, id: string) => request(app.getHttpServer()).get(`/api/v1/calendar/events/${id}`).set(bearer(user.token));
  const list = (user: TestUser, query: Record<string, string> = {}) =>
    request(app.getHttpServer()).get('/api/v1/calendar/events').query(query).set(bearer(user.token));
  const patch = (user: TestUser, id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).patch(`/api/v1/calendar/events/${id}`).set(bearer(user.token)).send(body);
  const del = (user: TestUser, id: string, query: Record<string, string> = {}) =>
    request(app.getHttpServer()).delete(`/api/v1/calendar/events/${id}`).query(query).set(bearer(user.token));

  const basicTimed = (overrides: Record<string, unknown> = {}) => ({
    title: 'Standup',
    startsAt: '2026-09-22T09:00:00Z',
    endsAt: '2026-09-22T09:30:00Z',
    timezone: 'America/New_York',
    ...overrides,
  });

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('creating an event', () => {
    it('creates a timed event and returns it', async () => {
      const res = await create(userA, basicTimed({ notes: 'Daily sync', location: 'Zoom', color: '#4287f5' })).expect(201);
      expect(res.body).toMatchObject({
        title: 'Standup',
        notes: 'Daily sync',
        location: 'Zoom',
        color: '#4287f5',
        allDay: false,
        startsAt: '2026-09-22T09:00:00.000Z',
        endsAt: '2026-09-22T09:30:00.000Z',
        timezone: 'America/New_York',
        rrule: null,
        seriesUntil: null,
        source: 'manual',
      });
      expect(res.body.id).toEqual(expect.any(String));
      expect(res.body.createdAt).toEqual(expect.any(String));

      const fetched = await get(userA, res.body.id).expect(200);
      expect(fetched.body).toEqual(res.body);
    });

    it('creates an all-day event from inclusive calendar dates', async () => {
      const res = await create(userA, { title: 'Vacation', allDay: true, startsAt: '2026-10-01', endsAt: '2026-10-03' }).expect(201);
      expect(res.body).toMatchObject({ allDay: true, startsAt: '2026-10-01', endsAt: '2026-10-03' });
    });

    it('defaults timezone to the caller\'s own, and source to manual', async () => {
      const res = await create(userA, basicTimed({ timezone: undefined })).expect(201);
      expect(res.body.timezone).toBe('UTC'); // userA has not set a timezone
      expect(res.body.source).toBe('manual');
    });

    it('accepts a client-supplied id, and rejects a repeat of the same id with 409', async () => {
      const id = randomUUID();
      const first = await create(userA, { ...basicTimed(), id }).expect(201);
      expect(first.body.id).toBe(id);

      const repeat = await create(userA, { ...basicTimed(), id }).expect(409);
      expect(repeat.body).toMatchObject({ statusCode: 409, error: 'CONFLICT' });
    });

    it('rejects a client-supplied id that collides with another user\'s event, since ids are globally unique', async () => {
      const id = randomUUID();
      await create(userA, { ...basicTimed(), id }).expect(201);
      const res = await create(userB, { ...basicTimed(), id }).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'CONFLICT' });
    });

    it.each([
      ['no title', { title: undefined }],
      ['an empty title', { title: '' }],
      ['endsAt before startsAt', { startsAt: '2026-09-22T10:00:00Z', endsAt: '2026-09-22T09:00:00Z' }],
      ['endsAt equal to startsAt', { endsAt: '2026-09-22T09:00:00Z' }],
      ['an event longer than the max duration', { endsAt: '2027-01-01T00:00:00Z' }],
      ['startsAt centuries away', { startsAt: '2300-01-01T00:00:00Z', endsAt: '2300-01-01T01:00:00Z' }],
      ['a bad timezone', { timezone: 'Not/AZone' }],
      ['an invalid color', { color: 'blue' }],
      ['a bad rrule frequency', { rrule: 'FREQ=HOURLY' }],
      ['a rrule with an unsupported component', { rrule: 'FREQ=DAILY;BYHOUR=9' }],
      ['both COUNT and UNTIL', { rrule: 'FREQ=DAILY;COUNT=3;UNTIL=2026-12-31' }],
      ['an impossible rrule', { rrule: 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30' }],
      ['a bad source', { source: 'not-a-source' }],
      ['a non-UUID client id', { id: 'not-a-uuid' }],
      ['an unknown property', { extra: 'nope' }],
      ['allDay startsAt not a calendar date', { allDay: true, startsAt: '2026-09-22T09:00:00Z', endsAt: '2026-10-01' }],
    ])('rejects %s with a 400 and the standard error shape', async (_name, override) => {
      const res = await create(userA, basicTimed(override)).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'BAD_REQUEST' });
      expect(res.body.message).toEqual(expect.any(String));
    });

    it('replays an Idempotency-Key instead of creating a second event', async () => {
      const key = { 'Idempotency-Key': `create-${randomUUID()}` };
      const first = await request(app.getHttpServer()).post('/api/v1/calendar/events').set(bearer(userA.token)).set(key).send(basicTimed({ title: 'Once' })).expect(201);
      const replay = await request(app.getHttpServer()).post('/api/v1/calendar/events').set(bearer(userA.token)).set(key).send(basicTimed({ title: 'Once' })).expect(201);
      expect(replay.body).toEqual(first.body);

      const { body } = await list(userA, { limit: '100' }).expect(200);
      expect(body.items.filter((e: { title: string }) => e.title === 'Once')).toHaveLength(1);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).post('/api/v1/calendar/events').send(basicTimed()).expect(401);
    });
  });

  describe('reading an event', () => {
    it('is 404 for another user\'s event, exactly as for one that does not exist', async () => {
      const mine = await create(userA, basicTimed()).expect(201);
      const stranger = await get(userB, mine.body.id).expect(404);
      const missing = await get(userB, '2a3b4c5d-0000-4000-8000-000000000000').expect(404);
      expect(stranger.body).toEqual(missing.body);
    });

    it('is 400 for an id that is not a UUID, and 401 without a session', async () => {
      await get(userA, 'not-a-uuid').expect(400);
      await request(app.getHttpServer()).get('/api/v1/calendar/events/2a3b4c5d-0000-4000-8000-000000000000').expect(401);
    });
  });

  describe('listing events', () => {
    it('lists ascending by start, and only the caller\'s own', async () => {
      const isolated = await signUpAndVerify(app, sentMails);
      const e1 = await create(isolated, basicTimed({ title: 'First', startsAt: '2027-01-03T09:00:00Z', endsAt: '2027-01-03T10:00:00Z' })).expect(201);
      const e2 = await create(isolated, basicTimed({ title: 'Second', startsAt: '2027-01-01T09:00:00Z', endsAt: '2027-01-01T10:00:00Z' })).expect(201);
      const e3 = await create(isolated, basicTimed({ title: 'Third', startsAt: '2027-01-02T09:00:00Z', endsAt: '2027-01-02T10:00:00Z' })).expect(201);

      const { body } = await list(isolated, { limit: '100' }).expect(200);
      const mine = body.items.filter((e: { id: string }) => [e1.body.id, e2.body.id, e3.body.id].includes(e.id));
      expect(mine.map((e: { title: string }) => e.title)).toEqual(['Second', 'Third', 'First']);
    });

    it('pages through results without skipping or repeating any', async () => {
      const isolated = await signUpAndVerify(app, sentMails);
      const created = [];
      for (let i = 0; i < 5; i += 1) {
        const res = await create(isolated, basicTimed({ title: `E${i}`, startsAt: `2027-02-0${i + 1}T09:00:00Z`, endsAt: `2027-02-0${i + 1}T10:00:00Z` })).expect(201);
        created.push(res.body.id);
      }
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let pages = 0; pages < 10; pages += 1) {
        const res = await list(isolated, { limit: '2', ...(cursor ? { cursor } : {}) }).expect(200);
        expect(res.body.items.length).toBeLessThanOrEqual(2);
        seen.push(...res.body.items.map((e: { id: string }) => e.id));
        cursor = res.body.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(created.every((id) => seen.includes(id))).toBe(true);
      expect(new Set(seen).size).toBe(seen.length);
    });

    it('filters by from/to overlap on the master\'s span, including an open-ended recurring series', async () => {
      const isolated = await signUpAndVerify(app, sentMails);
      const outside = await create(isolated, basicTimed({ title: 'Outside', startsAt: '2027-03-01T09:00:00Z', endsAt: '2027-03-01T10:00:00Z' })).expect(201);
      const inside = await create(isolated, basicTimed({ title: 'Inside', startsAt: '2027-03-10T09:00:00Z', endsAt: '2027-03-10T10:00:00Z' })).expect(201);
      const ongoing = await create(isolated, basicTimed({ title: 'Ongoing', startsAt: '2027-01-01T09:00:00Z', endsAt: '2027-01-01T10:00:00Z', rrule: 'FREQ=WEEKLY;BYDAY=MO' })).expect(201);

      const { body } = await list(isolated, { from: '2027-03-05', to: '2027-03-15', limit: '100' }).expect(200);
      const ids = body.items.map((e: { id: string }) => e.id);
      expect(ids).toContain(inside.body.id);
      expect(ids).toContain(ongoing.body.id); // still active, no seriesUntil
      expect(ids).not.toContain(outside.body.id);
    });

    it('rejects a bad limit or cursor', async () => {
      for (const query of [{ limit: '0' }, { limit: '101' }, { cursor: 'nonsense' }, { from: 'not-a-date' }]) {
        await list(userA, query).expect(400);
      }
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/calendar/events').expect(401);
    });
  });

  describe('updating and deleting with scope "all" (the default)', () => {
    it('updates the master in place', async () => {
      const created = await create(userA, basicTimed()).expect(201);
      const updated = await patch(userA, created.body.id, { title: 'Renamed', location: 'New room' }).expect(200);
      expect(updated.body).toMatchObject({ id: created.body.id, title: 'Renamed', location: 'New room', notes: null });
    });

    it('can null out an optional field explicitly', async () => {
      const created = await create(userA, basicTimed({ notes: 'Has notes' })).expect(201);
      const updated = await patch(userA, created.body.id, { notes: null }).expect(200);
      expect(updated.body.notes).toBeNull();
    });

    it('re-validates timing on update', async () => {
      const created = await create(userA, basicTimed()).expect(201);
      await patch(userA, created.body.id, { startsAt: '2026-09-22T10:00:00Z', endsAt: '2026-09-22T09:00:00Z' }).expect(400);
    });

    it('is 404 for another user\'s event', async () => {
      const created = await create(userA, basicTimed()).expect(201);
      await patch(userB, created.body.id, { title: 'Hijacked' }).expect(404);
      await del(userB, created.body.id).expect(404);
    });

    it('deletes the whole event, which then 404s', async () => {
      const created = await create(userA, basicTimed()).expect(201);
      await del(userA, created.body.id).expect(204);
      await get(userA, created.body.id).expect(404);
      await del(userA, created.body.id).expect(404); // already gone
    });

    it('excludes a deleted event from the list', async () => {
      const created = await create(userA, basicTimed({ title: 'ToDelete', startsAt: '2027-04-01T09:00:00Z', endsAt: '2027-04-01T10:00:00Z' })).expect(201);
      await del(userA, created.body.id).expect(204);
      const { body } = await list(userA, { from: '2027-03-28', to: '2027-04-05', limit: '100' }).expect(200);
      expect(body.items.map((e: { id: string }) => e.id)).not.toContain(created.body.id);
    });

    it('requires authentication for PATCH and DELETE', async () => {
      const created = await create(userA, basicTimed()).expect(201);
      await request(app.getHttpServer()).patch(`/api/v1/calendar/events/${created.body.id}`).send({ title: 'x' }).expect(401);
      await request(app.getHttpServer()).delete(`/api/v1/calendar/events/${created.body.id}`).expect(401);
    });
  });
});
