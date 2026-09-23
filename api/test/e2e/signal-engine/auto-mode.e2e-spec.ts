import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';
import { createEngineTestApp, emitGroceryCost } from './support.js';
import type { SignalEngineFacade } from '../../../src/signal-engine/signal-engine.facade.js';

describe('Signal engine: auto mode (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let facade: SignalEngineFacade;
  let user: TestUser;

  beforeAll(async () => {
    ({ app, sentMails, facade } = await createEngineTestApp());
    user = await signUpAndVerify(app, sentMails);
    await request(app.getHttpServer())
      .patch('/api/v1/connections/grocery-cost-to-budget')
      .set(bearer(user.token))
      .send({ mode: 'auto' })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('applies immediately with revert data recorded', async () => {
    const { payload } = await emitGroceryCost(facade, user.userId);

    const inboxRes = await request(app.getHttpServer())
      .get('/api/v1/inbox')
      .query({ status: 'auto_applied' })
      .set(bearer(user.token))
      .expect(200);
    const item = inboxRes.body.items.find((s: { targetKey: string }) => s.targetKey === `sandbox:grocery:${payload.groceryListId}`);
    expect(item).toBeTruthy();
    expect(item.status).toBe('auto_applied');
    expect(item.revertData).toEqual({ groceryListId: payload.groceryListId });

    const activityRes = await request(app.getHttpServer())
      .get('/api/v1/activity')
      .query({ kind: 'auto_applied' })
      .set(bearer(user.token))
      .expect(200);
    const activity = activityRes.body.items.find((a: { suggestionId: string }) => a.suggestionId === item.id);
    expect(activity).toBeTruthy();

    const undone = await request(app.getHttpServer())
      .post(`/api/v1/activity/${activity.id}/undo`)
      .set(bearer(user.token))
      .expect(200);
    expect(undone.body.status).toBe('reverted');
  });

  it('supersedes when the handler reports a conflict', async () => {
    const { payload } = await emitGroceryCost(facade, user.userId, 'conflict-');

    const inboxRes = await request(app.getHttpServer())
      .get('/api/v1/inbox')
      .query({ status: 'superseded' })
      .set(bearer(user.token))
      .expect(200);
    const item = inboxRes.body.items.find((s: { targetKey: string }) => s.targetKey === `sandbox:grocery:${payload.groceryListId}`);
    expect(item).toBeTruthy();
    expect(item.status).toBe('superseded');
  });

  it('gracefully downgrades to a plain pending suggestion when the handler throws', async () => {
    const { payload } = await emitGroceryCost(facade, user.userId, 'throws-');

    const inboxRes = await request(app.getHttpServer())
      .get('/api/v1/inbox')
      .query({ status: 'pending' })
      .set(bearer(user.token))
      .expect(200);
    const item = inboxRes.body.items.find((s: { targetKey: string }) => s.targetKey === `sandbox:grocery:${payload.groceryListId}`);
    expect(item).toBeTruthy();
    expect(item.status).toBe('pending');
    expect(item.failureNote).toContain('sandbox handler intentionally threw');
  });
});
