import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../src/lib/prisma.js';
import { SignalProcessorService } from '../../../src/signal-engine/bus/signal-processor.service.js';
import { SweeperCron } from '../../../src/signal-engine/bus/sweeper.cron.js';
import { SuggestionsService } from '../../../src/signal-engine/services/suggestions.service.js';
import type { SignalEngineFacade } from '../../../src/signal-engine/signal-engine.facade.js';
import { bearer, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';
import { createEngineTestApp, emitGroceryCost } from './support.js';

describe('Signal engine: dedupe, sweeper retries, expiry (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let facade: SignalEngineFacade;
  let prisma: PrismaService;
  let processor: SignalProcessorService;
  let sweeper: SweeperCron;
  let suggestionsService: SuggestionsService;
  let user: TestUser;

  beforeAll(async () => {
    ({ app, sentMails, facade } = await createEngineTestApp());
    prisma = app.get(PrismaService);
    processor = app.get(SignalProcessorService);
    sweeper = app.get(SweeperCron);
    suggestionsService = app.get(SuggestionsService);
    user = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reprocessing the same signal creates no duplicate suggestion', async () => {
    const { signal, payload } = await emitGroceryCost(facade, user.userId);

    // The fast path already processed it once; reprocess it directly to simulate
    // the sweeper picking up a signal that was already handled.
    await processor.processSignal(signal.id);
    await processor.processSignal(signal.id);

    const matches = await prisma.suggestion.findMany({ where: { targetKey: `sandbox:grocery:${payload.groceryListId}` } });
    expect(matches).toHaveLength(1);
  });

  it('the sweeper retries a failing signal with backoff and stops after 5 attempts', async () => {
    const { signal } = await emitGroceryCost(facade, user.userId, 'rule-throws-');

    for (let i = 0; i < 5; i += 1) {
      await prisma.signal.update({ where: { id: signal.id }, data: { nextAttemptAt: new Date(0) } });
      await sweeper.sweep();
    }

    const afterFiveAttempts = await prisma.signal.findUniqueOrThrow({ where: { id: signal.id } });
    expect(afterFiveAttempts.attempts).toBe(5);
    expect(afterFiveAttempts.processedAt).toBeNull();
    expect(afterFiveAttempts.lastError).toContain('sandbox rule intentionally threw');

    // A 6th sweep must not claim it again (attempts < 5 is part of the claim query).
    await prisma.signal.update({ where: { id: signal.id }, data: { nextAttemptAt: new Date(0) } });
    await sweeper.sweep();
    const afterSixthSweep = await prisma.signal.findUniqueOrThrow({ where: { id: signal.id } });
    expect(afterSixthSweep.attempts).toBe(5);
  });

  it('the expiry cron expires pending suggestions past their expiresAt', async () => {
    const { payload } = await emitGroceryCost(facade, user.userId);
    const suggestion = await prisma.suggestion.findFirstOrThrow({
      where: { targetKey: `sandbox:grocery:${payload.groceryListId}` },
    });
    await prisma.suggestion.update({ where: { id: suggestion.id }, data: { expiresAt: new Date(0) } });

    const count = await suggestionsService.expirePending();
    expect(count).toBeGreaterThanOrEqual(1);

    const updated = await prisma.suggestion.findUniqueOrThrow({ where: { id: suggestion.id } });
    expect(updated.status).toBe('expired');

    const activity = await prisma.activityLog.findFirst({ where: { suggestionId: suggestion.id, kind: 'expired' } });
    expect(activity).toBeTruthy();
  });
});

describe('Signal engine: per-connection pending cap (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let facade: SignalEngineFacade;
  let user: TestUser;

  beforeAll(async () => {
    // Nest's ConfigModule.forRoot() runs once at module-import time (correct
    // for a real process, but it means MAX_PENDING_PER_CONNECTION can't be
    // overridden per-test via process.env here), so this exercises the real
    // default (20) rather than a smaller override.
    ({ app, sentMails, facade } = await createEngineTestApp());
    user = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  it('drops the oldest pending suggestions once the cap (20) is exceeded', async () => {
    for (let i = 0; i < 21; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await emitGroceryCost(facade, user.userId);
    }

    const res = await request(app.getHttpServer())
      .get('/api/v1/inbox')
      .query({ connectionId: 'grocery-cost-to-budget', status: 'pending', limit: 100 })
      .set(bearer(user.token))
      .expect(200);

    expect(res.body.items.length).toBeLessThanOrEqual(20);

    const expiredRes = await request(app.getHttpServer())
      .get('/api/v1/inbox')
      .query({ connectionId: 'grocery-cost-to-budget', status: 'expired', limit: 100 })
      .set(bearer(user.token))
      .expect(200);
    expect(expiredRes.body.items.length).toBeGreaterThanOrEqual(1);
  });
});
