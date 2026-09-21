import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../src/lib/prisma.js';
import type { SignalEngineFacade } from '../../../src/signal-engine/signal-engine.facade.js';
import { bearer, type SentMail, signUpAndVerify, type TestUser, waitForExportReady } from '../helpers.js';
import { createEngineTestApp, emitBillDue } from './support.js';

describe('Signal engine: manual overrides, export, account deletion (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let facade: SignalEngineFacade;
  let prisma: PrismaService;
  let user: TestUser;

  beforeAll(async () => {
    ({ app, sentMails, facade } = await createEngineTestApp());
    prisma = app.get(PrismaService);
    user = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  it('supersedePending marks matching pending suggestions superseded and logs it', async () => {
    const { payload } = await emitBillDue(facade, user.userId);
    const targetKey = `sandbox:bill:${payload.billId}`;
    const suggestion = await prisma.suggestion.findFirstOrThrow({ where: { targetKey } });

    await facade.supersedePending(user.userId, targetKey, 'manual entry took precedence');

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/inbox/${suggestion.id}`)
      .set(bearer(user.token))
      .expect(200);
    expect(detail.body.status).toBe('superseded');
    expect(detail.body.supersededReason).toBe('manual entry took precedence');
  });

  it('recordCorrection logs a manual_override entry linked to the resolved suggestion', async () => {
    const { payload } = await emitBillDue(facade, user.userId);
    const targetKey = `sandbox:bill:${payload.billId}`;
    const suggestion = await prisma.suggestion.findFirstOrThrow({ where: { targetKey } });
    await request(app.getHttpServer()).post(`/api/v1/inbox/${suggestion.id}/approve`).set(bearer(user.token)).expect(200);

    await facade.recordCorrection(user.userId, {
      targetKey,
      entityRef: { type: 'sandbox-task', id: payload.billId },
      before: { reminderFor: payload.billId },
      after: { reminderFor: `${payload.billId}-corrected` },
    });

    const activityRes = await request(app.getHttpServer())
      .get('/api/v1/activity')
      .query({ kind: 'manual_override' })
      .set(bearer(user.token))
      .expect(200);
    const entry = activityRes.body.items.find((a: { suggestionId: string }) => a.suggestionId === suggestion.id);
    expect(entry).toBeTruthy();
    expect(entry.after).toEqual({ reminderFor: `${payload.billId}-corrected` });
  });

  it('data export includes signals, suggestions, connection settings, and activity log', async () => {
    await emitBillDue(facade, user.userId);
    await request(app.getHttpServer())
      .patch('/api/v1/connections/workout-to-habit')
      .set(bearer(user.token))
      .send({ mode: 'auto' })
      .expect(200);

    const created = await request(app.getHttpServer()).post('/api/v1/me/export').set(bearer(user.token)).expect(201);
    const ready = await waitForExportReady(app, user.token, created.body.id);
    const data = JSON.parse(ready.text);

    expect(Array.isArray(data.signals)).toBe(true);
    expect(data.signals.length).toBeGreaterThan(0);
    expect(Array.isArray(data.suggestions)).toBe(true);
    expect(data.suggestions.length).toBeGreaterThan(0);
    expect(Array.isArray(data.connectionSettings)).toBe(true);
    expect(data.connectionSettings.some((c: { connectionId: string }) => c.connectionId === 'workout-to-habit')).toBe(
      true,
    );
    expect(Array.isArray(data.activityLog)).toBe(true);
    expect(data.activityLog.length).toBeGreaterThan(0);
  });

  it('account deletion cascades signals, suggestions, connection settings, and activity log', async () => {
    const doomed = await signUpAndVerify(app, sentMails);
    await emitBillDue(facade, doomed.userId);
    await request(app.getHttpServer())
      .patch('/api/v1/connections/bill-to-reminder')
      .set(bearer(doomed.token))
      .send({ mode: 'auto' })
      .expect(200);

    await request(app.getHttpServer())
      .delete('/api/v1/me')
      .set(bearer(doomed.token))
      .send({ password: doomed.password })
      .expect(204);

    const [signals, suggestions, settings, activity] = await Promise.all([
      prisma.signal.count({ where: { userId: doomed.userId } }),
      prisma.suggestion.count({ where: { userId: doomed.userId } }),
      prisma.connectionSetting.count({ where: { userId: doomed.userId } }),
      prisma.activityLog.count({ where: { userId: doomed.userId } }),
    ]);

    expect(signals).toBe(0);
    expect(suggestions).toBe(0);
    expect(settings).toBe(0);
    expect(activity).toBe(0);
  });
});
