import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser } from './helpers.js';

describe('Settings & privacy (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let user: TestUser;

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    user = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns default settings created on sign-up', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/me/settings').set(bearer(user.token)).expect(200);
    expect(res.body).toMatchObject({ timezone: 'UTC', weekStartsOn: 1, units: 'metric', currency: 'USD' });
  });

  it('updates settings and normalizes currency casing', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/me/settings')
      .set(bearer(user.token))
      .send({ timezone: 'Europe/Paris', currency: 'eur', weekStartsOn: 0 })
      .expect(200);

    expect(res.body.timezone).toBe('Europe/Paris');
    expect(res.body.currency).toBe('EUR');
    expect(res.body.weekStartsOn).toBe(0);
  });

  it('rejects an invalid timezone', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/me/settings')
      .set(bearer(user.token))
      .send({ timezone: 'Not/AZone' })
      .expect(400);
  });

  it('rejects an invalid currency code', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/me/settings')
      .set(bearer(user.token))
      .send({ currency: 'ZZZ' })
      .expect(400);
  });

  it('rejects weekStartsOn out of range', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/me/settings')
      .set(bearer(user.token))
      .send({ weekStartsOn: 7 })
      .expect(400);
  });

  it('defaults every privacy domain to private', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/me/privacy').set(bearer(user.token)).expect(200);
    for (const domain of ['calendar', 'tasks', 'habits', 'fitness', 'finances', 'meals']) {
      expect(res.body[domain]).toBe('private');
    }
  });

  it('updates a single privacy domain without touching the others', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/me/privacy')
      .set(bearer(user.token))
      .send({ fitness: 'shared' })
      .expect(200);

    expect(res.body.fitness).toBe('shared');
    expect(res.body.calendar).toBe('private');
  });

  it('rejects an invalid privacy value', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/me/privacy')
      .set(bearer(user.token))
      .send({ meals: 'public' })
      .expect(400);
  });
});
