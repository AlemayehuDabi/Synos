import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobRunner } from '../../../src/common/jobs/job-runner.js';
import { localMinutesOfDay } from '../../../src/common/time/timezone.js';
import { PrismaService } from '../../../src/lib/prisma.js';
import { NotificationPreferencesService } from '../../../src/notifications/notification-preferences.service.js';
import { PUSH_PROVIDER } from '../../../src/notifications/push/push-provider.js';
import { SUGGESTIONS_CREATED_EVENT } from '../../../src/signal-engine/events.js';
import { SignalEngineFacade } from '../../../src/signal-engine/signal-engine.facade.js';
import { FakePushProvider } from '../../sandbox/fake-push-provider.js';
import { SandboxModule } from '../../sandbox/sandbox.module.js';
import { TrackingJobRunner } from '../../sandbox/tracking-job-runner.js';
import { bearer, createTestApp, registerDevice, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';
import { emitBillDue, findSuggestion } from '../signal-engine/support.js';

interface InboxNotification {
  category: string;
  domain: string | null;
  title: string;
  body: string;
  data: { suggestionId?: string; connectionId?: string; count?: number };
  readAt: string | null;
}

describe('Inbox suggestion notifications (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let prisma: PrismaService;
  let engine: SignalEngineFacade;
  let userA: TestUser;
  let userB: TestUser;
  let tokenA: string;
  let tokenB: string;
  const push = new FakePushProvider();
  const jobs = new TrackingJobRunner();

  const inboxNotifications = async (user: TestUser) =>
    ((await request(app.getHttpServer()).get('/api/v1/notifications').query({ limit: 100 }).set(bearer(user.token)).expect(200)).body.items as InboxNotification[]).filter(
      (n) => n.category === 'inbox_suggestion',
    );
  const setPreferences = (user: TestUser, body: unknown) =>
    request(app.getHttpServer()).patch('/api/v1/notification-preferences').set(bearer(user.token)).send(body as object).expect(200);
  /** Makes the last push for this user look like it went out two minutes ago. */
  const ageThrottle = (user: TestUser) =>
    prisma.notificationPushThrottle.updateMany({ where: { userId: user.userId }, data: { lastPushedAt: new Date(Date.now() - 120_000) } });
  const settle = () => jobs.idle();

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp([SandboxModule], (builder) =>
      builder.overrideProvider(PUSH_PROVIDER).useValue(push).overrideProvider(JobRunner).useValue(jobs),
    ));
    prisma = app.get(PrismaService);
    engine = app.get(SignalEngineFacade);
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
    tokenA = await registerDevice(app, userA.token);
    tokenB = await registerDevice(app, userB.token);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await settle();
    push.reset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('turns a new pending suggestion into an in-app notification and a push', async () => {
    const { payload } = await emitBillDue(engine, userA.userId);
    await settle();

    const suggestion = await findSuggestion(app, userA.token, payload.billId);
    expect(suggestion).toBeTruthy();

    const notifications = await inboxNotifications(userA);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      category: 'inbox_suggestion',
      domain: 'tasks', // the connection's target domain
      title: 'New suggestion',
      body: suggestion.title,
      readAt: null,
      data: { suggestionId: suggestion.id, connectionId: 'bill-to-reminder' },
    });

    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]).toMatchObject({
      token: tokenA,
      title: 'New suggestion',
      body: suggestion.title,
      data: { category: 'inbox_suggestion', suggestionId: suggestion.id },
    });
  });

  it('still notifies in-app for every suggestion, but pushes at most once a minute', async () => {
    await emitBillDue(engine, userA.userId);
    await emitBillDue(engine, userA.userId);
    await settle();

    expect(await inboxNotifications(userA)).toHaveLength(3); // one from before, two now
    expect(push.attempts).toEqual([]); // the minute is not up
  });

  it('pushes again once the minute is up', async () => {
    await ageThrottle(userA);
    await emitBillDue(engine, userA.userId);
    await settle();
    expect(push.sent).toHaveLength(1);
  });

  it('buzzes a phone once for a burst that arrives all at once', async () => {
    await Promise.all([emitBillDue(engine, userB.userId), emitBillDue(engine, userB.userId), emitBillDue(engine, userB.userId)]);
    await settle();

    expect(await inboxNotifications(userB)).toHaveLength(3);
    expect(push.attempts).toHaveLength(1);
    expect(push.attempts[0].token).toBe(tokenB);
  });

  it('sums several suggestions from one event into a single push', async () => {
    await ageThrottle(userA);
    const suggestions = ['Water plants', 'Pay rent', 'Call Sam'].map((title) => ({
      id: randomUUID(),
      connectionId: 'bill-to-reminder' as const,
      targetDomain: 'tasks' as const,
      title,
    }));
    const before = (await inboxNotifications(userA)).length;

    await app.get(EventEmitter2).emitAsync(SUGGESTIONS_CREATED_EVENT, { userId: userA.userId, suggestions });
    await settle();

    expect(await inboxNotifications(userA)).toHaveLength(before + 3);
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]).toMatchObject({
      title: '3 new suggestions',
      body: 'Water plants, Pay rent, Call Sam',
      data: { category: 'inbox_suggestion', count: '3' },
    });

    // The same event again (say, a retried delivery) neither duplicates the notifications nor pushes.
    await ageThrottle(userA);
    push.reset();
    await app.get(EventEmitter2).emitAsync(SUGGESTIONS_CREATED_EVENT, { userId: userA.userId, suggestions });
    await settle();
    expect(await inboxNotifications(userA)).toHaveLength(before + 3);
    expect(push.attempts).toEqual([]);
  });

  describe('when a connection is in auto mode', () => {
    beforeAll(async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/connections/bill-to-reminder')
        .set(bearer(userB.token))
        .send({ mode: 'auto' })
        .expect(200);
    });

    it('does not bother the user about what was applied without asking', async () => {
      await ageThrottle(userB);
      const before = (await inboxNotifications(userB)).length;

      const { payload } = await emitBillDue(engine, userB.userId);
      await settle();

      expect(await findSuggestion(app, userB.token, payload.billId, 'auto_applied')).toBeTruthy();
      expect(await inboxNotifications(userB)).toHaveLength(before);
      expect(push.attempts).toEqual([]);
    });

    it('does not notify about a suggestion that was superseded instead', async () => {
      const before = (await inboxNotifications(userB)).length;
      const { payload } = await emitBillDue(engine, userB.userId, 'conflict-');
      await settle();

      expect(await findSuggestion(app, userB.token, payload.billId, 'superseded')).toBeTruthy();
      expect(await inboxNotifications(userB)).toHaveLength(before);
      expect(push.attempts).toEqual([]);
    });

    it('does notify when auto-apply falls back to asking the user', async () => {
      const before = (await inboxNotifications(userB)).length;
      const { payload } = await emitBillDue(engine, userB.userId, 'throws-');
      await settle();

      const suggestion = await findSuggestion(app, userB.token, payload.billId, 'pending');
      expect(suggestion).toBeTruthy();
      const notifications = await inboxNotifications(userB);
      expect(notifications).toHaveLength(before + 1);
      expect(notifications.some((n) => n.data.suggestionId === suggestion.id)).toBe(true);
      expect(push.sent).toHaveLength(1);
    });
  });

  describe('preferences and quiet hours', () => {
    it('keeps the push but stores nothing when in-app is off for the category', async () => {
      await setPreferences(userA, { categories: [{ category: 'inbox_suggestion', inApp: false }] });
      await ageThrottle(userA);
      const before = (await inboxNotifications(userA)).length;

      const { payload } = await emitBillDue(engine, userA.userId);
      await settle();

      const suggestion = await findSuggestion(app, userA.token, payload.billId);
      expect(await inboxNotifications(userA)).toHaveLength(before);
      expect(push.sent).toHaveLength(1);
      expect(push.sent[0]).toMatchObject({ title: 'New suggestion', body: suggestion.title });
      await setPreferences(userA, { categories: [{ category: 'inbox_suggestion', inApp: true }] });
    });

    it('stores the notification but sends no push when push is off for the category', async () => {
      await setPreferences(userA, { categories: [{ category: 'inbox_suggestion', push: false }] });
      await ageThrottle(userA);
      const before = (await inboxNotifications(userA)).length;

      await emitBillDue(engine, userA.userId);
      await settle();

      expect(await inboxNotifications(userA)).toHaveLength(before + 1);
      expect(push.attempts).toEqual([]);
      await setPreferences(userA, { categories: [{ category: 'inbox_suggestion', push: true }] });
    });

    it('holds the push back in quiet hours without using up the minute', async () => {
      await ageThrottle(userA);
      const now = localMinutesOfDay(new Date(), 'UTC');
      const hhmm = (minutes: number) => {
        const wrapped = ((minutes % 1440) + 1440) % 1440;
        return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
      };
      await setPreferences(userA, { quietHours: { start: hhmm(now - 60), end: hhmm(now + 60) } });
      const before = (await inboxNotifications(userA)).length;

      await emitBillDue(engine, userA.userId);
      await settle();
      expect(await inboxNotifications(userA)).toHaveLength(before + 1); // in-app is never suppressed
      expect(push.attempts).toEqual([]);

      // Nothing was sent, so the rate limit was not spent: the next suggestion after quiet hours buzzes straight away.
      await setPreferences(userA, { quietHours: null });
      await emitBillDue(engine, userA.userId);
      await settle();
      expect(push.sent).toHaveLength(1);
    });
  });

  it('keeps working when notifying fails', async () => {
    vi.spyOn(NotificationPreferencesService.prototype, 'loadForDelivery').mockRejectedValueOnce(new Error('db hiccup'));
    const before = (await inboxNotifications(userA)).length;

    const { signal, payload } = await emitBillDue(engine, userA.userId); // does not throw
    await settle();

    expect(await findSuggestion(app, userA.token, payload.billId)).toBeTruthy();
    expect((await prisma.signal.findUniqueOrThrow({ where: { id: signal.id } })).processedAt).not.toBeNull();
    expect(await inboxNotifications(userA)).toHaveLength(before);
  });

  it('never tells one user about another user\'s suggestions', async () => {
    const idsOf = async (user: TestUser) => new Set((await inboxNotifications(user)).map((n) => n.data.suggestionId).filter(Boolean));
    const forA = await idsOf(userA);
    const forB = await idsOf(userB);
    expect(forA.size).toBeGreaterThan(0);
    expect(forB.size).toBeGreaterThan(0);
    expect([...forA].filter((id) => forB.has(id))).toEqual([]);

    // Some of userA's ids come from the manual event above and do not exist in the engine; every real one is userA's.
    const real = await prisma.suggestion.findMany({ where: { id: { in: [...forA] as string[] } }, select: { userId: true } });
    expect(real.every((suggestion) => suggestion.userId === userA.userId)).toBe(true);
  });
});
