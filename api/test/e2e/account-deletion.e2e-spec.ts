import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type SentMail, signUpAndVerify } from './helpers.js';

describe('Account deletion (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires a password for a credential (email/password) account', async () => {
    const user = await signUpAndVerify(app, sentMails);
    await request(app.getHttpServer()).delete('/api/v1/me').set(bearer(user.token)).expect(400);
  });

  it('rejects an incorrect password', async () => {
    const user = await signUpAndVerify(app, sentMails);
    await request(app.getHttpServer())
      .delete('/api/v1/me')
      .set(bearer(user.token))
      .send({ password: 'the-wrong-password' })
      .expect(403);
  });

  it('deletes the account, cascades all data, and revokes the session', async () => {
    const user = await signUpAndVerify(app, sentMails);

    await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set(bearer(user.token))
      .send({ platform: 'android', pushToken: `tok-${randomUUID()}` })
      .expect(201);

    await request(app.getHttpServer())
      .delete('/api/v1/me')
      .set(bearer(user.token))
      .send({ password: user.password })
      .expect(204);

    // session is gone: the same bearer token no longer authenticates
    await request(app.getHttpServer()).get('/api/v1/me').set(bearer(user.token)).expect(401);

    // the account itself is gone: signing in again fails
    const signInAgain = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: user.email, password: user.password });
    expect(signInAgain.status).not.toBe(200);
  });
});
