import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser } from './helpers.js';

describe('Devices (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a device for the current user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set(bearer(userA.token))
      .send({ platform: 'ios', pushToken: `tok-${randomUUID()}` })
      .expect(201);

    expect(res.body.userId).toBe(userA.userId);
    expect(res.body.platform).toBe('ios');
  });

  it('moves a push token to the new owner when re-registered by someone else', async () => {
    const pushToken = `tok-${randomUUID()}`;
    await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set(bearer(userA.token))
      .send({ platform: 'ios', pushToken })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set(bearer(userB.token))
      .send({ platform: 'android', pushToken })
      .expect(201);

    expect(res.body.userId).toBe(userB.userId);
    expect(res.body.platform).toBe('android');
  });

  it('prevents deleting a device owned by another user', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set(bearer(userA.token))
      .send({ platform: 'ios', pushToken: `tok-${randomUUID()}` })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/devices/${created.body.id}`)
      .set(bearer(userB.token))
      .expect(404);
  });

  it('allows the owner to delete their own device', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set(bearer(userA.token))
      .send({ platform: 'ios', pushToken: `tok-${randomUUID()}` })
      .expect(201);

    await request(app.getHttpServer()).delete(`/api/v1/devices/${created.body.id}`).set(bearer(userA.token)).expect(200);
  });

  it('DELETE /devices?token= is idempotent sign-out cleanup', async () => {
    const pushToken = `tok-${randomUUID()}`;
    await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set(bearer(userA.token))
      .send({ platform: 'ios', pushToken })
      .expect(201);

    await request(app.getHttpServer())
      .delete('/api/v1/devices')
      .query({ token: pushToken })
      .set(bearer(userA.token))
      .expect(200);

    // second call: device already gone, must not error
    await request(app.getHttpServer())
      .delete('/api/v1/devices')
      .query({ token: pushToken })
      .set(bearer(userA.token))
      .expect(200);
  });

  it('requires a token query parameter', async () => {
    await request(app.getHttpServer()).delete('/api/v1/devices').set(bearer(userA.token)).expect(400);
  });
});
