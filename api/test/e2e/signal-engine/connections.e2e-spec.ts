import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';
import { createEngineTestApp, emitGroceryCost } from './support.js';
import type { SignalEngineFacade } from '../../../src/signal-engine/signal-engine.facade.js';

describe('Signal engine: connections (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let facade: SignalEngineFacade;
  let user: TestUser;

  beforeAll(async () => {
    ({ app, sentMails, facade } = await createEngineTestApp());
    user = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists the fixed catalog merged with defaults and availability', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/connections').set(bearer(user.token)).expect(200);
    expect(res.body).toHaveLength(6);

    // Real rules, supplied by the Tasks module.
    const bill = res.body.find((c: { id: string }) => c.id === 'bill-to-reminder');
    expect(bill).toMatchObject({ mode: 'suggest', defaultMode: 'suggest', maxMode: 'auto', available: true });
    const recovery = res.body.find((c: { id: string }) => c.id === 'recovery-to-task-load');
    expect(recovery).toMatchObject({ mode: 'suggest', defaultMode: 'suggest', maxMode: 'suggest', available: true });

    // Real rules, supplied by the Habits module.
    const workout = res.body.find((c: { id: string }) => c.id === 'workout-to-habit');
    expect(workout).toMatchObject({ mode: 'suggest', defaultMode: 'suggest', maxMode: 'auto', available: true });
    const pattern = res.body.find((c: { id: string }) => c.id === 'recurring-task-to-habit');
    expect(pattern).toMatchObject({ mode: 'suggest', defaultMode: 'suggest', maxMode: 'suggest', available: true });

    // The sandbox rule's own connection.
    const grocery = res.body.find((c: { id: string }) => c.id === 'grocery-cost-to-budget');
    expect(grocery).toMatchObject({ maxMode: 'auto', available: true });

    // Genuinely unimplemented: no rule anywhere.
    const budgetToMeals = res.body.find((c: { id: string }) => c.id === 'budget-overrun-to-cheaper-meals');
    expect(budgetToMeals).toMatchObject({ maxMode: 'suggest', available: false });
  });

  it('rejects a mode above the connection maxMode', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/connections/budget-overrun-to-cheaper-meals')
      .set(bearer(user.token))
      .send({ mode: 'auto' })
      .expect(400);
  });

  it('logs the signal but creates no suggestion when the connection is off', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/connections/grocery-cost-to-budget')
      .set(bearer(user.token))
      .send({ mode: 'off' })
      .expect(200);

    const { signal, payload } = await emitGroceryCost(facade, user.userId);

    const signalsRes = await request(app.getHttpServer())
      .get('/api/v1/signals')
      .query({ type: 'grocery.cost' })
      .set(bearer(user.token))
      .expect(200);
    expect(signalsRes.body.items.some((s: { id: string }) => s.id === signal.id)).toBe(true);

    const inboxRes = await request(app.getHttpServer())
      .get('/api/v1/inbox')
      .query({ connectionId: 'grocery-cost-to-budget', status: 'pending' })
      .set(bearer(user.token))
      .expect(200);
    expect(
      inboxRes.body.items.some((s: { targetKey: string }) => s.targetKey === `sandbox:grocery:${payload.groceryListId}`),
    ).toBe(false);

    // restore for other tests in this file/process
    await request(app.getHttpServer())
      .patch('/api/v1/connections/grocery-cost-to-budget')
      .set(bearer(user.token))
      .send({ mode: 'suggest' })
      .expect(200);
  });
});
