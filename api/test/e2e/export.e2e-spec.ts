import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser, waitForExportReady } from './helpers.js';

describe('Data export (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let userA: TestUser;
  let userB: TestUser;
  let userC: TestUser;
  let userD: TestUser;

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    // Signed up sequentially, not via Promise.all: each sign-up runs the
    // UserLifecycleHook database hook, and four of those firing at once against
    // the pg driver adapter's connection pool is a concurrency edge case in the
    // stack unrelated to what this suite is testing.
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
    userC = await signUpAndVerify(app, sentMails);
    userD = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a job, runs it, and produces a downloadable export containing this task\'s data', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set(bearer(userA.token))
      .send({ platform: 'ios', pushToken: `tok-${randomUUID()}` })
      .expect(201);

    const created = await request(app.getHttpServer()).post('/api/v1/me/export').set(bearer(userA.token)).expect(201);
    expect(created.body.status).toBe('queued');

    const ready = await waitForExportReady(app, userA.token, created.body.id);
    expect(ready.headers['content-disposition']).toContain('attachment');

    const data = JSON.parse(ready.text);
    expect(data.profile.email).toBe(userA.email);
    expect(data.settings.timezone).toBe('UTC');
    expect(data.privacy.calendar).toBe('private');
    expect(data.devices).toHaveLength(1);
  });

  it('rejects a second export request shortly after the first (409 or 429)', async () => {
    await request(app.getHttpServer()).post('/api/v1/me/export').set(bearer(userB.token)).expect(201);

    const second = await request(app.getHttpServer()).post('/api/v1/me/export').set(bearer(userB.token));
    expect([409, 429]).toContain(second.status);
  });

  it('prevents a user from reading another user\'s export job', async () => {
    const created = await request(app.getHttpServer()).post('/api/v1/me/export').set(bearer(userC.token)).expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/me/export/${created.body.id}`)
      .set(bearer(userD.token))
      .expect(404);
  });

  it('returns 404 for a non-existent export job', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/me/export/00000000-0000-0000-0000-000000000000')
      .set(bearer(userD.token))
      .expect(404);
  });
});
