import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser, updateSettings } from '../helpers.js';

const CATEGORIES = ['inbox_suggestion', 'review_ready', 'bill', 'reminder', 'system'];

describe('Notification preferences (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let userA: TestUser;
  let userB: TestUser;

  const get = (user: TestUser) => request(app.getHttpServer()).get('/api/v1/notification-preferences').set(bearer(user.token));
  const patch = (user: TestUser, body: unknown) =>
    request(app.getHttpServer()).patch('/api/v1/notification-preferences').set(bearer(user.token)).send(body as object);
  const channel = (body: { categories: { category: string; inApp: boolean; push: boolean }[] }, category: string) => {
    const { inApp, push } = body.categories.find((entry) => entry.category === category)!;
    return { inApp, push };
  };

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  it('starts with everything on and no quiet hours, without anything having been saved', async () => {
    const res = await get(userA).expect(200);
    expect(res.body.categories.map((entry: { category: string }) => entry.category)).toEqual(CATEGORIES);
    for (const entry of res.body.categories) expect(entry).toMatchObject({ inApp: true, push: true });
    expect(res.body.quietHours).toEqual({ start: null, end: null, timezone: 'UTC' });
  });

  it('round-trips category switches and quiet hours', async () => {
    const update = {
      categories: [
        { category: 'bill', push: false },
        { category: 'reminder', inApp: false, push: false },
      ],
      quietHours: { start: '22:00', end: '07:00' },
    };
    const patched = await patch(userA, update).expect(200);
    const fetched = await get(userA).expect(200);
    expect(fetched.body).toEqual(patched.body);

    expect(channel(fetched.body, 'bill')).toEqual({ inApp: true, push: false });
    expect(channel(fetched.body, 'reminder')).toEqual({ inApp: false, push: false });
    for (const untouched of ['inbox_suggestion', 'review_ready', 'system']) {
      expect(channel(fetched.body, untouched), untouched).toEqual({ inApp: true, push: true });
    }
    expect(fetched.body.quietHours).toEqual({ start: '22:00', end: '07:00', timezone: 'UTC' });
  });

  it('changes only what it is sent', async () => {
    await patch(userA, { categories: [{ category: 'bill', inApp: false }] }).expect(200);
    const { body } = await get(userA).expect(200);
    expect(channel(body, 'bill')).toEqual({ inApp: false, push: false }); // push stayed off from before
    expect(channel(body, 'reminder')).toEqual({ inApp: false, push: false });
    expect(body.quietHours).toMatchObject({ start: '22:00', end: '07:00' });

    await patch(userA, {}).expect(200);
    expect((await get(userA).expect(200)).body).toEqual(body);
  });

  it('accepts a quiet range inside one day as well as one that wraps midnight', async () => {
    await patch(userA, { quietHours: { start: '13:00', end: '15:30' } }).expect(200);
    expect((await get(userA).expect(200)).body.quietHours).toMatchObject({ start: '13:00', end: '15:30' });
    await patch(userA, { quietHours: { start: '23:59', end: '00:00' } }).expect(200);
    expect((await get(userA).expect(200)).body.quietHours).toMatchObject({ start: '23:59', end: '00:00' });
  });

  it('turns quiet hours off with null, leaving the switches alone', async () => {
    await patch(userA, { quietHours: null }).expect(200);
    const { body } = await get(userA).expect(200);
    expect(body.quietHours).toEqual({ start: null, end: null, timezone: 'UTC' });
    expect(channel(body, 'bill')).toEqual({ inApp: false, push: false });

    await patch(userA, { quietHours: { start: null, end: null } }).expect(200);
  });

  it('reads the quiet hours in the timezone from the user\'s settings', async () => {
    await patch(userA, { quietHours: { start: '22:00', end: '07:00' } }).expect(200);
    await updateSettings(app, userA.token, { timezone: 'Africa/Nairobi' });
    expect((await get(userA).expect(200)).body.quietHours).toEqual({ start: '22:00', end: '07:00', timezone: 'Africa/Nairobi' });
  });

  it.each([
    ['an unknown category', { categories: [{ category: 'gossip', push: false }] }],
    ['a category listed twice', { categories: [{ category: 'bill', push: false }, { category: 'bill', push: true }] }],
    ['a non-boolean switch', { categories: [{ category: 'bill', push: 'yes' }] }],
    ['categories that is not a list', { categories: 'bill' }],
    ['a malformed time', { quietHours: { start: '7:00', end: '22:00' } }],
    ['an hour past 23', { quietHours: { start: '24:00', end: '07:00' } }],
    ['minutes past 59', { quietHours: { start: '22:60', end: '07:00' } }],
    ['only a start', { quietHours: { start: '22:00' } }],
    ['only an end', { quietHours: { end: '07:00' } }],
    ['a start equal to the end', { quietHours: { start: '08:00', end: '08:00' } }],
    ['an unknown property', { emailDigest: true }],
    ['an unknown property inside a category', { categories: [{ category: 'bill', sms: true }] }],
  ])('rejects %s with a 400 and the standard error shape', async (_name, body) => {
    const res = await patch(userA, body).expect(400);
    expect(res.body).toMatchObject({ statusCode: 400, error: 'BAD_REQUEST' });
    expect(res.body.message).toEqual(expect.any(String));
  });

  it('applies a request completely or not at all', async () => {
    const before = (await get(userA).expect(200)).body;
    // The category change is valid; the quiet hours are not.
    await patch(userA, { categories: [{ category: 'system', push: false }], quietHours: { start: '08:00', end: '08:00' } }).expect(400);
    await patch(userA, { categories: [{ category: 'system', push: false }, { category: 'system', push: true }] }).expect(400);
    expect((await get(userA).expect(200)).body).toEqual(before);
  });

  it('keeps each user\'s preferences to themselves', async () => {
    const { body } = await get(userB).expect(200);
    for (const entry of body.categories) expect(entry).toMatchObject({ inApp: true, push: true });
    expect(body.quietHours).toEqual({ start: null, end: null, timezone: 'UTC' });

    await patch(userB, { categories: [{ category: 'system', push: false }] }).expect(200);
    expect(channel((await get(userA).expect(200)).body, 'system')).toEqual({ inApp: true, push: true });
  });

  it.each(['get', 'patch'] as const)('requires a session for %s', async (method) => {
    const res = await request(app.getHttpServer())[method]('/api/v1/notification-preferences');
    expect(res.status).toBe(401);
  });
});
