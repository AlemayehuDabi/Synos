import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';
import { createEngineTestApp, emitBillDue } from './support.js';
import type { SignalEngineFacade } from '../../../src/signal-engine/signal-engine.facade.js';

describe('Signal engine: suggest mode (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let facade: SignalEngineFacade;
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    ({ app, sentMails, facade } = await createEngineTestApp());
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a pending suggestion, approves it, logs activity, and can be undone', async () => {
    const { signal, payload } = await emitBillDue(facade, userA.userId);

    const inboxRes = await request(app.getHttpServer())
      .get('/api/v1/inbox')
      .query({ connectionId: 'bill-to-reminder' })
      .set(bearer(userA.token))
      .expect(200);
    const created = inboxRes.body.items.find((s: { targetKey: string }) => s.targetKey === `sandbox:bill:${payload.billId}`);
    expect(created).toBeTruthy();
    expect(created.status).toBe('pending');

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/inbox/${created.id}`)
      .set(bearer(userA.token))
      .expect(200);
    expect(detail.body.trigger).toMatchObject({ signalId: signal.id, type: 'bill.due' });

    const approved = await request(app.getHttpServer())
      .post(`/api/v1/inbox/${created.id}/approve`)
      .set(bearer(userA.token))
      .expect(200);
    expect(approved.body.status).toBe('approved');
    expect(approved.body.revertData).toEqual({ billId: payload.billId });

    const activityRes = await request(app.getHttpServer())
      .get('/api/v1/activity')
      .query({ kind: 'suggestion_approved' })
      .set(bearer(userA.token))
      .expect(200);
    const approvedActivity = activityRes.body.items.find((a: { suggestionId: string }) => a.suggestionId === created.id);
    expect(approvedActivity).toBeTruthy();
    expect(approvedActivity.after).toEqual({ reminderFor: payload.billId });

    const undone = await request(app.getHttpServer())
      .post(`/api/v1/activity/${approvedActivity.id}/undo`)
      .set(bearer(userA.token))
      .expect(200);
    expect(undone.body.status).toBe('reverted');

    await request(app.getHttpServer())
      .post(`/api/v1/activity/${approvedActivity.id}/undo`)
      .set(bearer(userA.token))
      .expect(409);
  });

  it('rejects approving with params that fail the handler schema (422)', async () => {
    const { payload } = await emitBillDue(facade, userA.userId);
    const inboxRes = await request(app.getHttpServer())
      .get('/api/v1/inbox')
      .set(bearer(userA.token))
      .expect(200);
    const created = inboxRes.body.items.find((s: { targetKey: string }) => s.targetKey === `sandbox:bill:${payload.billId}`);

    await request(app.getHttpServer())
      .post(`/api/v1/inbox/${created.id}/approve`)
      .set(bearer(userA.token))
      .send({ params: { billId: 12345 } })
      .expect(422);
  });

  it('rejects dismissing a suggestion twice (409 the second time)', async () => {
    const { payload } = await emitBillDue(facade, userA.userId);
    const inboxRes = await request(app.getHttpServer()).get('/api/v1/inbox').set(bearer(userA.token)).expect(200);
    const created = inboxRes.body.items.find((s: { targetKey: string }) => s.targetKey === `sandbox:bill:${payload.billId}`);

    await request(app.getHttpServer())
      .post(`/api/v1/inbox/${created.id}/dismiss`)
      .set(bearer(userA.token))
      .send({ reason: 'not needed' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/inbox/${created.id}/dismiss`)
      .set(bearer(userA.token))
      .expect(409);
  });

  it('enforces cross-user ownership on every inbox/activity route', async () => {
    const { payload } = await emitBillDue(facade, userA.userId);
    const inboxRes = await request(app.getHttpServer()).get('/api/v1/inbox').set(bearer(userA.token)).expect(200);
    const created = inboxRes.body.items.find((s: { targetKey: string }) => s.targetKey === `sandbox:bill:${payload.billId}`);

    await request(app.getHttpServer()).get(`/api/v1/inbox/${created.id}`).set(bearer(userB.token)).expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/inbox/${created.id}`)
      .set(bearer(userB.token))
      .send({ params: { billId: 'x' } })
      .expect(404);
    await request(app.getHttpServer()).post(`/api/v1/inbox/${created.id}/approve`).set(bearer(userB.token)).expect(404);
    await request(app.getHttpServer()).post(`/api/v1/inbox/${created.id}/dismiss`).set(bearer(userB.token)).expect(404);

    const approved = await request(app.getHttpServer())
      .post(`/api/v1/inbox/${created.id}/approve`)
      .set(bearer(userA.token))
      .expect(200);
    const activityRes = await request(app.getHttpServer())
      .get('/api/v1/activity')
      .set(bearer(userA.token))
      .expect(200);
    const activity = activityRes.body.items.find((a: { suggestionId: string }) => a.suggestionId === approved.body.id);

    await request(app.getHttpServer()).post(`/api/v1/activity/${activity.id}/undo`).set(bearer(userB.token)).expect(404);
  });
});
