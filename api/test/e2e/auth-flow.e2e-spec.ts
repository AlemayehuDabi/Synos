import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type SentMail, signUpAndVerify, uniqueEmail } from './helpers.js';

describe('Auth flow (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('signs up, verifies email, signs in, and accesses /me with a bearer token', async () => {
    const user = await signUpAndVerify(app, sentMails);

    const res = await request(app.getHttpServer()).get('/api/v1/me').set(bearer(user.token)).expect(200);

    expect(res.body.email).toBe(user.email);
    expect(res.body.emailVerified).toBe(true);
    expect(res.body.name).toBe(user.name);
  });

  it('rejects unauthenticated access to /me', async () => {
    await request(app.getHttpServer()).get('/api/v1/me').expect(401);
  });

  it('does not issue a session token before email is verified', async () => {
    const email = uniqueEmail('unverified');
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({ email, password: 'correcthorsebattery', name: 'Unverified' })
      .expect(200);

    expect(res.body.token).toBeNull();
  });

  it('keeps Better Auth routes reachable unprefixed but not under /api/v1', async () => {
    await request(app.getHttpServer()).get('/api/auth/get-session').expect(200);
    await request(app.getHttpServer()).get('/api/v1/api/auth/get-session').expect(404);
  });
});
