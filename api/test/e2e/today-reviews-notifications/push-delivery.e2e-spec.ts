import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { JobRunner } from '../../../src/common/jobs/job-runner.js';
import { localMinutesOfDay } from '../../../src/common/time/timezone.js';
import { PrismaService } from '../../../src/lib/prisma.js';
import { NotificationsFacade, type NotifyInput } from '../../../src/notifications/notifications.facade.js';
import { PUSH_PROVIDER } from '../../../src/notifications/push/push-provider.js';
import { FakePushProvider } from '../../sandbox/fake-push-provider.js';
import { TrackingJobRunner } from '../../sandbox/tracking-job-runner.js';
import { bearer, createTestApp, registerDevice, type SentMail, signUpAndVerify, type TestUser, updateSettings } from '../helpers.js';

const formatMinutes = (total: number) => {
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
};

/** Quiet hours built around the user's local "now" so the test does not depend on when it runs. */
const quietRange = {
  /** A same-day-style range holding now: from an hour ago until an hour ahead. */
  around: (timezone: string) => {
    const now = localMinutesOfDay(new Date(), timezone);
    return { start: formatMinutes(now - 60), end: formatMinutes(now + 60) };
  },
  /** An overnight-style range (start later in the day than end) that still holds now: all day except the next half hour. */
  wrapping: (timezone: string) => {
    const now = localMinutesOfDay(new Date(), timezone);
    return { start: formatMinutes(now + 60), end: formatMinutes(now + 30) };
  },
  /** A range that does not hold now: it starts in two hours and lasts one. */
  away: (timezone: string) => {
    const now = localMinutesOfDay(new Date(), timezone);
    return { start: formatMinutes(now + 120), end: formatMinutes(now + 180) };
  },
};

describe('Push delivery (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let prisma: PrismaService;
  let facade: NotificationsFacade;
  let userA: TestUser;
  let userB: TestUser;
  const push = new FakePushProvider();
  const jobs = new TrackingJobRunner();
  let tokenA1: string;
  let tokenA2: string;
  let tokenB: string;

  const notify = (user: TestUser, overrides: Partial<NotifyInput> = {}) =>
    facade.notify({ userId: user.userId, category: 'bill', title: 'Rent due', body: 'Friday', ...overrides });
  const setPreferences = (user: TestUser, body: unknown) =>
    request(app.getHttpServer()).patch('/api/v1/notification-preferences').set(bearer(user.token)).send(body as object).expect(200);
  const titles = async (user: TestUser) =>
    (await request(app.getHttpServer()).get('/api/v1/notifications').query({ limit: 100 }).set(bearer(user.token)).expect(200)).body.items.map(
      (n: { title: string }) => n.title,
    ) as string[];
  const devicesOf = async (user: TestUser) => (await prisma.device.findMany({ where: { userId: user.userId } })).map((d) => d.pushToken).sort();
  const attemptsFor = (token: string) => push.attempts.filter((message) => message.token === token).length;
  const sentTokens = () => push.sent.map((message) => message.token).sort();

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp([], (builder) =>
      builder.overrideProvider(PUSH_PROVIDER).useValue(push).overrideProvider(JobRunner).useValue(jobs),
    ));
    prisma = app.get(PrismaService);
    facade = app.get(NotificationsFacade);
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await jobs.idle();
    push.reset();
  });

  it('keeps the in-app notification when the user has no devices to push to', async () => {
    const result = await notify(userB, { title: 'No devices' });
    await jobs.idle();
    expect(result).toMatchObject({ created: true, pushQueued: false });
    expect(push.attempts).toEqual([]);
    expect(await titles(userB)).toContain('No devices');
  });

  describe('with devices', () => {
    beforeAll(async () => {
      tokenA1 = await registerDevice(app, userA.token, undefined, 'ios');
      tokenA2 = await registerDevice(app, userA.token, undefined, 'android');
      tokenB = await registerDevice(app, userB.token);
    });

    it('pushes to every device of the user, and to nobody else\'s', async () => {
      const result = await notify(userA, {
        category: 'bill',
        domain: 'finances',
        title: 'Rent due',
        body: 'Friday',
        data: { billId: 'b1', amountCents: 120_000, tags: ['rent'] },
      });
      await jobs.idle();

      expect(result).toMatchObject({ created: true, pushQueued: true });
      expect(sentTokens()).toEqual([tokenA1, tokenA2].sort());
      expect(sentTokens()).not.toContain(tokenB);

      const ios = push.sent.find((message) => message.token === tokenA1)!;
      expect(ios).toEqual({
        token: tokenA1,
        platform: 'ios',
        title: 'Rent due',
        body: 'Friday',
        data: {
          category: 'bill',
          notificationId: result.notification!.id,
          domain: 'finances',
          billId: 'b1',
          amountCents: '120000', // push data is a flat string map
          tags: '["rent"]',
        },
      });
      expect(push.sent.find((message) => message.token === tokenA2)!.platform).toBe('android');
    });

    it('does not push a duplicate', async () => {
      await notify(userA, { dedupeKey: 'push-dedupe' });
      await jobs.idle();
      const before = push.sent.length;

      const repeat = await notify(userA, { dedupeKey: 'push-dedupe' });
      await jobs.idle();
      expect(repeat).toMatchObject({ created: false, pushQueued: false });
      expect(push.sent).toHaveLength(before);
    });

    describe('quiet hours', () => {
      it.each([
        ['a range holding now', 'around'],
        ['an overnight-style range holding now', 'wrapping'],
      ] as const)('hold the push back but keep the in-app notification: %s', async (_name, shape) => {
        await setPreferences(userA, { quietHours: quietRange[shape]('UTC') });
        const title = `Quiet ${shape}`;

        const result = await notify(userA, { title });
        await jobs.idle();

        expect(result).toMatchObject({ created: true, pushQueued: false });
        expect(result.notification).not.toBeNull();
        expect(push.attempts).toEqual([]);
        expect(await titles(userA)).toContain(title);
      });

      it('let the push through when they do not cover now', async () => {
        await setPreferences(userA, { quietHours: quietRange.away('UTC') });
        const result = await notify(userA, { title: 'Awake' });
        await jobs.idle();
        expect(result.pushQueued).toBe(true);
        expect(push.sent).toHaveLength(2);
      });

      it('apply to every category alike', async () => {
        await setPreferences(userA, { quietHours: quietRange.around('UTC') });
        for (const category of ['inbox_suggestion', 'review_ready', 'bill', 'reminder', 'system'] as const) {
          expect((await notify(userA, { category, title: `Quiet ${category}` })).pushQueued, category).toBe(false);
        }
        await jobs.idle();
        expect(push.attempts).toEqual([]);
      });

      it('are read on the user\'s own clock', async () => {
        // Kiritimati is 14 hours ahead of UTC: the same "HH:mm" strings hold now for one user, and not for the other.
        await updateSettings(app, userA.token, { timezone: 'Pacific/Kiritimati' });
        const range = quietRange.around('Pacific/Kiritimati');
        await setPreferences(userA, { quietHours: range });
        await setPreferences(userB, { quietHours: range });

        const inKiritimati = await notify(userA, { title: 'Kiritimati' });
        const inUtc = await notify(userB, { title: 'Utc' });
        await jobs.idle();

        expect(inKiritimati.pushQueued).toBe(false);
        expect(inUtc.pushQueued).toBe(true);
        expect(sentTokens()).toEqual([tokenB]);

        await updateSettings(app, userA.token, { timezone: 'UTC' });
        await setPreferences(userA, { quietHours: null });
        await setPreferences(userB, { quietHours: null });
      });

      it('stop suppressing as soon as they are cleared', async () => {
        await setPreferences(userA, { quietHours: quietRange.around('UTC') });
        expect((await notify(userA)).pushQueued).toBe(false);
        await setPreferences(userA, { quietHours: null });
        expect((await notify(userA)).pushQueued).toBe(true);
        await jobs.idle();
      });
    });

    describe('preferences', () => {
      it('respect a category\'s push switch: stored in-app, nothing pushed', async () => {
        await setPreferences(userA, { categories: [{ category: 'reminder', push: false }] });

        const off = await notify(userA, { category: 'reminder', title: 'Reminder, push off' });
        const other = await notify(userA, { category: 'system', title: 'System, push on' });
        await jobs.idle();

        expect(off).toMatchObject({ pushQueued: false });
        expect(off.notification).not.toBeNull();
        expect(other.pushQueued).toBe(true);
        expect(push.sent.map((message) => message.title)).toEqual(['System, push on', 'System, push on']);
        expect(await titles(userA)).toEqual(expect.arrayContaining(['Reminder, push off', 'System, push on']));
        await setPreferences(userA, { categories: [{ category: 'reminder', push: true }] });
      });

      it('respect a category\'s in-app switch: pushed, nothing stored', async () => {
        await setPreferences(userA, { categories: [{ category: 'system', inApp: false }] });

        const result = await notify(userA, { category: 'system', title: 'Push only' });
        await jobs.idle();

        expect(result).toMatchObject({ created: true, pushQueued: true, notification: null });
        expect(push.sent).toHaveLength(2);
        expect(push.sent[0].data).not.toHaveProperty('notificationId');
        expect(await titles(userA)).not.toContain('Push only');
        await setPreferences(userA, { categories: [{ category: 'system', inApp: true }] });
      });

      it('do nothing at all when both switches are off', async () => {
        await setPreferences(userA, { categories: [{ category: 'bill', inApp: false, push: false }] });
        const result = await notify(userA, { category: 'bill', title: 'Nothing' });
        await jobs.idle();
        expect(result).toEqual({ notification: null, created: true, pushQueued: false });
        expect(push.attempts).toEqual([]);
        expect(await titles(userA)).not.toContain('Nothing');
        await setPreferences(userA, { categories: [{ category: 'bill', inApp: true, push: true }] });
      });

      it('belong to the user: turning things off for one leaves another\'s alone', async () => {
        await setPreferences(userA, { categories: [{ category: 'bill', push: false }] });
        expect((await notify(userB, { category: 'bill' })).pushQueued).toBe(true);
        await jobs.idle();
        expect(sentTokens()).toEqual([tokenB]);
        await setPreferences(userA, { categories: [{ category: 'bill', push: true }] });
      });
    });

    describe('failures', () => {
      it('removes a device whose token has become permanently invalid, and no other', async () => {
        push.markInvalid(tokenA1);
        const result = await notify(userA, { title: 'Dead token' });
        await jobs.idle();

        expect(result.pushQueued).toBe(true);
        expect(await devicesOf(userA)).toEqual([tokenA2]);
        expect(await devicesOf(userB)).toEqual([tokenB]);
        expect(attemptsFor(tokenA1)).toBe(1); // a dead token is not retried
        expect(sentTokens()).toEqual([tokenA2]);

        push.reset();
        await notify(userA, { title: 'Afterwards' });
        await jobs.idle();
        expect(push.attempts.map((message) => message.token)).toEqual([tokenA2]);
        expect(await titles(userA)).toContain('Dead token');
      });

      it('retries a transient failure and delivers', async () => {
        push.failTransiently(tokenA2, 2);
        await notify(userA, { title: 'Flaky' });
        await jobs.idle();

        expect(attemptsFor(tokenA2)).toBe(3);
        expect(sentTokens()).toEqual([tokenA2]);
        expect(await devicesOf(userA)).toEqual([tokenA2]);
      });

      it('gives up after the configured attempts without losing the device or the notification', async () => {
        push.failTransiently(tokenA2, 50);
        const result = await notify(userA, { title: 'Never arrives' });
        await jobs.idle();

        expect(result.notification).not.toBeNull();
        expect(attemptsFor(tokenA2)).toBe(3); // PUSH_MAX_ATTEMPTS
        expect(push.sent).toEqual([]);
        expect(await devicesOf(userA)).toEqual([tokenA2]);
        expect(await titles(userA)).toContain('Never arrives');
      });

      it('lets one device\'s failure leave the others\' delivery alone', async () => {
        await registerDevice(app, userA.token, `${tokenA1}-again`, 'ios');
        push.failTransiently(tokenA2, 50);
        await notify(userA, { title: 'Partial' });
        await jobs.idle();

        expect(sentTokens()).toEqual([`${tokenA1}-again`]);
        await prisma.device.deleteMany({ where: { pushToken: `${tokenA1}-again` } });
      });
    });
  });
});
