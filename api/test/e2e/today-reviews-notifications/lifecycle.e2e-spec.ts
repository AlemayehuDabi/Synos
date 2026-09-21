import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../src/lib/prisma.js';
import { NotificationRetentionCron } from '../../../src/notifications/notification-retention.cron.js';
import { NotificationsFacade } from '../../../src/notifications/notifications.facade.js';
import { ReviewGenerationService } from '../../../src/reviews/review-generation.service.js';
import {
  bearer,
  createTestApp,
  registerDevice,
  type SentMail,
  signUpAndVerify,
  stopScheduledJobs,
  type TestUser,
  waitForExportReady,
} from '../helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// Feb 2036 starts on a Monday: last week (28 Jan - 3 Feb) and last month (January) both have a review to make.
const NOW = new Date('2036-02-04T10:00:00Z');

describe('Reviews and notifications across the account lifecycle (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let prisma: PrismaService;
  let facade: NotificationsFacade;
  let userA: TestUser; // exported
  let userB: TestUser; // bystander: must never appear in anyone's export, and survives a deletion
  let userC: TestUser; // deleted

  const seed = async (user: TestUser) => {
    await prisma.activityLog.createMany({
      data: ['2036-01-15T12:00:00Z', '2036-01-29T12:00:00Z'].map((at) => ({
        userId: user.userId,
        kind: 'suggestion_approved' as const,
        createdAt: new Date(at),
      })),
    });
    expect((await app.get(ReviewGenerationService).generateForUser(user.userId, NOW)).generated).toBe(2);

    await facade.notify({ userId: user.userId, category: 'system', title: 'Hello', body: 'World' });
    await facade.notify({ userId: user.userId, category: 'bill', title: 'Rent', body: 'Due', dedupeKey: `rent:${user.userId}` });
    await request(app.getHttpServer())
      .patch('/api/v1/notification-preferences')
      .set(bearer(user.token))
      .send({ categories: [{ category: 'bill', push: false }], quietHours: { start: '22:00', end: '07:00' } })
      .expect(200);
    await registerDevice(app, user.token);
    await prisma.notificationPushThrottle.create({ data: { userId: user.userId, category: 'inbox_suggestion', lastPushedAt: new Date() } });
  };

  const rowCounts = async (userId: string) => ({
    reviews: await prisma.review.count({ where: { userId } }),
    notifications: await prisma.notification.count({ where: { userId } }),
    preferences: await prisma.notificationPreference.count({ where: { userId } }),
    settings: await prisma.notificationSettings.count({ where: { userId } }),
    throttles: await prisma.notificationPushThrottle.count({ where: { userId } }),
    devices: await prisma.device.count({ where: { userId } }),
  });

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    stopScheduledJobs(app);
    prisma = app.get(PrismaService);
    facade = app.get(NotificationsFacade);
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
    userC = await signUpAndVerify(app, sentMails);
    await seed(userA);
    await seed(userB);
    await seed(userC);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('data export', () => {
    it('includes the user\'s reviews, notifications and notification preferences, and nobody else\'s', async () => {
      const created = await request(app.getHttpServer()).post('/api/v1/me/export').set(bearer(userA.token)).expect(201);
      const ready = await waitForExportReady(app, userA.token, created.body.id);
      const data = JSON.parse(ready.text);

      // The sections that were already there are still there.
      expect(data.profile.email).toBe(userA.email);
      expect(data.devices).toHaveLength(1);

      const ownNotifications = await prisma.notification.findMany({ where: { userId: userA.userId } });
      // Two written by hand, and one "review ready" for each of the two reviews generated in setup.
      expect(data.notifications).toHaveLength(4);
      expect(data.notifications.map((n: { id: string }) => n.id).sort()).toEqual(ownNotifications.map((n) => n.id).sort());
      expect(data.notifications.map((n: { title: string }) => n.title).sort()).toEqual([
        'Hello',
        'Rent',
        'Your monthly review is ready',
        'Your weekly review is ready',
      ]);

      expect(data.notificationPreferences.quietHours).toEqual({ start: '22:00', end: '07:00' });
      expect(data.notificationPreferences.categories).toHaveLength(1);
      expect(data.notificationPreferences.categories[0]).toMatchObject({ category: 'bill', push: false, inApp: true });

      expect(data.reviews).toHaveLength(2);
      expect(data.reviews.map((r: { type: string }) => r.type).sort()).toEqual(['monthly', 'weekly']);
      for (const review of data.reviews) {
        expect(review.userId).toBe(userA.userId);
        expect(review.sections.map((s: { domain: string }) => s.domain)).toContain('cross_domain');
      }

      const everything = ready.text;
      expect(everything).not.toContain(userB.userId);
      expect(everything).not.toContain(userC.userId);
    });

    it('exports empty sections, not missing ones, for a user with none', async () => {
      const fresh = await signUpAndVerify(app, sentMails);
      const created = await request(app.getHttpServer()).post('/api/v1/me/export').set(bearer(fresh.token)).expect(201);
      const data = JSON.parse((await waitForExportReady(app, fresh.token, created.body.id)).text);
      expect(data.reviews).toEqual([]);
      expect(data.notifications).toEqual([]);
      expect(data.notificationPreferences).toEqual({ categories: [], quietHours: null });
    });
  });

  describe('account deletion', () => {
    it('removes every review, notification, preference, throttle and device of the user and no one else\'s', async () => {
      const before = await rowCounts(userC.userId);
      expect(before).toEqual({ reviews: 2, notifications: 4, preferences: 1, settings: 1, throttles: 1, devices: 1 });
      const bystander = await rowCounts(userB.userId);

      await request(app.getHttpServer())
        .delete('/api/v1/me')
        .set(bearer(userC.token))
        .send({ password: userC.password })
        .expect(204);

      expect(await rowCounts(userC.userId)).toEqual({ reviews: 0, notifications: 0, preferences: 0, settings: 0, throttles: 0, devices: 0 });
      expect(await rowCounts(userB.userId)).toEqual(bystander);
      expect(await rowCounts(userA.userId)).toMatchObject({ reviews: 2, notifications: 4 });
    });
  });

  describe('retention', () => {
    it('prunes read notifications past the retention window, and only those', async () => {
      const now = Date.now();
      const make = (title: string, ageDays: number, readDaysAgo: number | null) =>
        prisma.notification.create({
          data: {
            userId: userB.userId,
            category: 'system',
            title,
            body: 'Body',
            createdAt: new Date(now - ageDays * DAY_MS),
            readAt: readDaysAgo === null ? null : new Date(now - readDaysAgo * DAY_MS),
          },
        });
      const expired = [await make('read 200d ago', 300, 200), await make('read 91d ago', 120, 91)];
      const kept = [
        await make('read 89d ago', 120, 89),
        await make('read yesterday', 300, 1),
        await make('unread for 400d', 400, null),
      ];

      await app.get(NotificationRetentionCron).pruneRead();

      const remaining = new Set((await prisma.notification.findMany({ where: { userId: userB.userId } })).map((n) => n.id));
      for (const notification of expired) expect(remaining.has(notification.id), notification.title).toBe(false);
      for (const notification of kept) expect(remaining.has(notification.id), notification.title).toBe(true);
    });

    it('can run twice in a row', async () => {
      await app.get(NotificationRetentionCron).pruneRead();
      await app.get(NotificationRetentionCron).pruneRead();
    });
  });
});
