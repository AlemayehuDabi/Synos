import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, type Mock, vi } from 'vitest';
import { startOfLocalDay } from '../../../src/common/time/timezone.js';
import type { ActivityKind } from '../../../src/generated/prisma/enums.js';
import { PrismaService } from '../../../src/lib/prisma.js';
import { ReviewGenerationService } from '../../../src/reviews/review-generation.service.js';
import { SandboxModule } from '../../sandbox/sandbox.module.js';
import { SandboxReviewFaultsModule, SandboxReviewModule } from '../../sandbox/review-contributors.js';
import { sandboxState } from '../../sandbox/sandbox-state.js';
import {
  bearer,
  createTestApp,
  type SentMail,
  signUpAndVerify,
  stopScheduledJobs,
  type TestUser,
  updateSettings,
} from '../helpers.js';

// All dates are in 2035: real activity left in the shared test database by other specs (or earlier
// runs) is never inside these periods, so nothing but what this spec seeds can make a review.
// 2035-01-01 is a Monday, the first of the month: last week and last month both ended the day before.
const NOW_UTC = new Date('2035-01-01T02:30:00Z');
const CHATHAM = 'Pacific/Chatham'; // UTC+12:45 / +13:45: shares its calendar with almost nobody else
const atLocalHour = (date: string, timezone: string, hours: number) =>
  new Date(startOfLocalDay(date, timezone).getTime() + hours * 3_600_000);

describe('Reviews (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let prisma: PrismaService;
  let generation: ReviewGenerationService;
  let userA: TestUser; // UTC
  let userB: TestUser; // Africa/Nairobi, weeks start on Sunday
  let userC: TestUser; // Pacific/Chatham, active
  let userD: TestUser; // Pacific/Chatham, does nothing

  const activity = (user: TestUser, kind: ActivityKind, at: string, count = 1) =>
    prisma.activityLog.createMany({ data: Array.from({ length: count }, () => ({ userId: user.userId, kind, createdAt: new Date(at) })) });

  const listReviews = (user: TestUser, query: Record<string, string> = {}) =>
    request(app.getHttpServer()).get('/api/v1/reviews').query(query).set(bearer(user.token));

  const reviewNotifications = async (user: TestUser) => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .query({ limit: 100 })
      .set(bearer(user.token))
      .expect(200);
    return res.body.items.filter((n: { category: string }) => n.category === 'review_ready');
  };

  const metricsOf = (review: { sections: { domain: string; metrics?: Record<string, unknown> }[] }, domain: string) =>
    review.sections.find((section) => section.domain === domain)?.metrics;

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp([SandboxModule, SandboxReviewModule, SandboxReviewFaultsModule]));
    stopScheduledJobs(app); // the real hourly job must not run in the middle of these tests
    prisma = app.get(PrismaService);
    generation = app.get(ReviewGenerationService);
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
    userC = await signUpAndVerify(app, sentMails);
    userD = await signUpAndVerify(app, sentMails);
    await updateSettings(app, userB.token, { timezone: 'Africa/Nairobi', weekStartsOn: 0 });
    await updateSettings(app, userC.token, { timezone: CHATHAM });
    await updateSettings(app, userD.token, { timezone: CHATHAM });
    sandboxState.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => vi.restoreAllMocks());

  describe('generating a user\'s reviews', () => {
    it('writes last week and last month, counting exactly what falls inside each period', async () => {
      await activity(userA, 'suggestion_approved', '2034-12-27T12:00:00Z', 2);
      await activity(userA, 'manual_override', '2034-12-28T09:00:00Z');
      await activity(userA, 'auto_applied', '2034-12-29T09:00:00Z');
      // The edges of the week: first instant in, last instant in, first instant of the next week out.
      await activity(userA, 'suggestion_approved', '2034-12-25T00:00:00.000Z');
      await activity(userA, 'suggestion_approved', '2034-12-31T23:59:59.999Z');
      await activity(userA, 'suggestion_approved', '2035-01-01T00:00:00.000Z'); // out of both
      // In December but not in the last week.
      await activity(userA, 'suggestion_approved', '2034-12-24T23:59:59.999Z');
      await activity(userA, 'suggestion_approved', '2034-12-10T09:00:00Z');
      await activity(userA, 'suggestion_dismissed', '2034-12-20T09:00:00Z');
      // Outside both.
      await activity(userA, 'suggestion_approved', '2034-11-20T12:00:00Z');
      await activity(userA, 'suggestion_approved', '2035-01-02T12:00:00Z');

      const stats = await generation.generateForUser(userA.userId, NOW_UTC);
      expect(stats).toMatchObject({ generated: 2, alreadyExisted: 0, skippedNoActivity: 0, failed: 0 });

      const res = await listReviews(userA).expect(200);
      expect(res.body.nextCursor).toBeNull();
      expect(res.body.items.map((r: { type: string }) => r.type)).toEqual(['weekly', 'monthly']);

      const [weekly, monthly] = res.body.items;
      expect(weekly).toMatchObject({ periodStart: '2034-12-25', periodEnd: '2034-12-31', timezone: 'UTC' });
      expect(monthly).toMatchObject({ periodStart: '2034-12-01', periodEnd: '2034-12-31', timezone: 'UTC' });
      expect(weekly.generatedAt).toEqual(expect.any(String));

      expect(metricsOf(weekly, 'cross_domain')).toEqual({
        suggestionsCreated: 0,
        suggestionsApproved: 4,
        suggestionsDismissed: 0,
        suggestionsAutoApplied: 1,
        suggestionsReverted: 0,
        manualOverrides: 1,
      });
      expect(metricsOf(monthly, 'cross_domain')).toEqual({
        suggestionsCreated: 0,
        suggestionsApproved: 6,
        suggestionsDismissed: 1,
        suggestionsAutoApplied: 1,
        suggestionsReverted: 0,
        manualOverrides: 1,
      });
    });

    it('has one section per registered domain, then the cross-domain one, and a bad domain never fails the review', async () => {
      const [weekly] = (await listReviews(userA).expect(200)).body.items;
      // 'calendar' and 'tasks' (canonical SignalDomain order) are the real Calendar and
      // Tasks modules' own contributors; this user has no calendar events or tasks - see
      // the Tasks e2e suite for real @ReviewContributor('tasks') behavior.
      expect(weekly.sections.map((s: { domain: string; status: string }) => `${s.domain}:${s.status}`)).toEqual([
        'calendar:ok',
        'tasks:ok',
        'habits:ok', // the real Habits module's own @ReviewContributor('habits'); this user has no habits - see the Habits e2e suite for real behavior
        'fitness:ok', // the sandbox fixture with a configurable completed count
        'finances:timeout',
        'meals:error',
        'cross_domain:ok',
      ]);
      expect(weekly.sections[0]).toEqual({ domain: 'calendar', status: 'ok', metrics: { eventsCount: 0, scheduledHours: 0 }, highlights: [] });
      expect(weekly.sections[1]).toEqual({
        domain: 'tasks',
        status: 'ok',
        metrics: { completed: 0, missed: 0, completionRate: 0, avgEstimateAccuracy: null },
        highlights: [],
      });
      expect(weekly.sections[2]).toEqual({ domain: 'habits', status: 'ok', metrics: { completed: 0, slips: 0, completionRate: 0 }, highlights: [] });
      expect(weekly.sections[3]).toEqual({ domain: 'fitness', status: 'ok', metrics: { completed: 0 }, highlights: [] });
      expect(weekly.sections[4]).toEqual({ domain: 'finances', status: 'timeout' });
      expect(weekly.sections[5]).toEqual({ domain: 'meals', status: 'error' });
      expect(JSON.stringify(weekly)).not.toContain('SECRET-MEALS-PAYLOAD');
    });

    it('asks the contributors about the exact period, in the user\'s timezone', async () => {
      const contexts = sandboxState.reviewContexts.filter((context) => context.userId === userA.userId);
      expect(contexts.map((context) => context.type).sort()).toEqual(['monthly', 'weekly']);
      const weekly = contexts.find((context) => context.type === 'weekly')!;
      expect(weekly).toMatchObject({ startDate: '2034-12-25', endDate: '2034-12-31', timezone: 'UTC' });
      expect(weekly.periodStart.toISOString()).toBe('2034-12-25T00:00:00.000Z');
      expect(weekly.periodEnd.toISOString()).toBe('2035-01-01T00:00:00.000Z');
    });

    it('tells the user each review is ready, once', async () => {
      const notifications = await reviewNotifications(userA);
      expect(notifications).toHaveLength(2);
      const reviews = (await listReviews(userA).expect(200)).body.items as { id: string; type: string }[];
      for (const review of reviews) {
        const notification = notifications.find((n: { data: { reviewId: string } }) => n.data.reviewId === review.id);
        expect(notification, `notification for ${review.type} review`).toMatchObject({
          category: 'review_ready',
          title: `Your ${review.type} review is ready`,
          readAt: null,
        });
      }
    });

    it('is idempotent: running it again changes nothing and collects nothing', async () => {
      const before = (await listReviews(userA).expect(200)).body.items;
      const collected = sandboxState.reviewContexts.length;

      const stats = await generation.generateForUser(userA.userId, NOW_UTC);
      expect(stats).toMatchObject({ generated: 0, alreadyExisted: 2, skippedNoActivity: 0, failed: 0 });

      expect((await listReviews(userA).expect(200)).body.items).toEqual(before);
      expect(await reviewNotifications(userA)).toHaveLength(2);
      expect(sandboxState.reviewContexts).toHaveLength(collected);
    });

    it('skips a user who did nothing, even though other domains had failures to report', async () => {
      const stats = await generation.generateForUser(userD.userId, NOW_UTC);
      expect(stats).toMatchObject({ generated: 0, skippedNoActivity: 2, failed: 0 });
      expect((await listReviews(userD).expect(200)).body.items).toEqual([]);
      expect(await reviewNotifications(userD)).toEqual([]);
    });

    it('cuts periods on the user\'s own calendar and week start, and survives two generators racing', async () => {
      // 23:30 UTC on 31 Dec is 02:30 on Monday 1 Jan in Nairobi (UTC+3). Weeks start on Sunday there,
      // so the last complete week is Sun 24 - Sat 30 Dec, and Dec 31 belongs to the week now beginning.
      const now = new Date('2034-12-31T23:30:00Z');
      await activity(userB, 'suggestion_approved', '2034-12-26T10:00:00Z');
      await activity(userB, 'suggestion_approved', '2034-12-23T22:00:00Z'); // 01:00 on 24 Dec: first hours of the week
      await activity(userB, 'suggestion_approved', '2034-12-23T20:59:59.999Z'); // 23:59 on 23 Dec: December, but not the week
      await activity(userB, 'suggestion_approved', '2034-12-31T20:30:00Z'); // 23:30 on 31 Dec: December, not last week
      await activity(userB, 'suggestion_approved', '2034-12-31T21:30:00Z'); // 00:30 on 1 Jan: neither

      const results = await Promise.all([
        generation.generateForUser(userB.userId, now),
        generation.generateForUser(userB.userId, now),
      ]);
      expect(results.reduce((sum, stats) => sum + stats.generated, 0)).toBe(2);
      expect(results.reduce((sum, stats) => sum + stats.failed, 0)).toBe(0);

      const { items } = (await listReviews(userB).expect(200)).body;
      expect(items).toHaveLength(2);
      const [weekly, monthly] = items;
      expect(weekly).toMatchObject({ type: 'weekly', periodStart: '2034-12-24', periodEnd: '2034-12-30', timezone: 'Africa/Nairobi' });
      expect(monthly).toMatchObject({ type: 'monthly', periodStart: '2034-12-01', periodEnd: '2034-12-31', timezone: 'Africa/Nairobi' });
      expect(metricsOf(weekly, 'cross_domain')).toMatchObject({ suggestionsApproved: 2 });
      expect(metricsOf(monthly, 'cross_domain')).toMatchObject({ suggestionsApproved: 4 });

      const monthlyContext = sandboxState.reviewContexts.find((c) => c.userId === userB.userId && c.type === 'monthly')!;
      expect(monthlyContext.periodStart.toISOString()).toBe('2034-11-30T21:00:00.000Z');
      expect(monthlyContext.periodEnd.toISOString()).toBe('2034-12-31T21:00:00.000Z');

      // The losing generator neither duplicated the reviews nor their notifications.
      expect(await reviewNotifications(userB)).toHaveLength(2);
    });
  });

  describe('the scheduled run', () => {
    const chathamAt = (date: string, hours = 2.5) => atLocalHour(date, CHATHAM, hours);

    it('leaves a user alone outside their own review hour', async () => {
      await activity(userC, 'suggestion_approved', '2034-12-27T12:00:00Z');
      await activity(userC, 'suggestion_created', '2034-12-27T13:00:00Z');
      await activity(userC, 'suggestion_approved', '2034-12-05T12:00:00Z'); // December only

      const stats = await generation.generateDue(chathamAt('2035-01-01', 5));
      expect(stats.generated).toBe(0);
      expect(await prisma.review.count({ where: { userId: userC.userId } })).toBe(0);
    });

    it('generates for users whose local clock is in the review hour, batched, under one lock', async () => {
      // One user per batch: getting through both Chatham users proves the batches chain together.
      const config = app.get(ConfigService);
      const realGet = config.get.bind(config) as (key: string, fallback?: unknown) => unknown;
      (vi.spyOn(config, 'get') as unknown as Mock).mockImplementation((key: string, fallback?: unknown) =>
        key === 'REVIEW_GENERATION_BATCH_SIZE' ? 1 : realGet(key, fallback),
      );

      // Two instances start the same run at the same moment: only one may do the work.
      const now = chathamAt('2035-01-01');
      const runs = await Promise.all([generation.runScheduled(now), generation.runScheduled(now)]);
      expect(runs.filter((run) => run.ran)).toHaveLength(1);
      const stats = runs.find((run) => run.ran)!.stats!;
      expect(stats).toMatchObject({ generated: 2, failed: 0 });
      expect(stats.skippedNoActivity).toBeGreaterThanOrEqual(1); // userD

      const { items } = (await listReviews(userC).expect(200)).body;
      expect(items.map((r: { type: string; periodStart: string }) => `${r.type}:${r.periodStart}`)).toEqual([
        'weekly:2034-12-25',
        'monthly:2034-12-01',
      ]);
      expect(items[0].timezone).toBe(CHATHAM);
      expect(metricsOf(items[0], 'cross_domain')).toMatchObject({ suggestionsApproved: 1, suggestionsCreated: 1 });
      expect(metricsOf(items[1], 'cross_domain')).toMatchObject({ suggestionsApproved: 2, suggestionsCreated: 1 });

      expect(await reviewNotifications(userC)).toHaveLength(2);
      expect(await prisma.review.count({ where: { userId: userD.userId } })).toBe(0);
    });

    it('can run again straight away, and finds nothing left to do', async () => {
      const run = await generation.runScheduled(chathamAt('2035-01-01'));
      expect(run.ran).toBe(true); // the lock was released
      expect(run.stats).toMatchObject({ generated: 0, failed: 0 });
      expect(run.stats!.alreadyExisted).toBeGreaterThanOrEqual(2);
      expect(await prisma.review.count({ where: { userId: userC.userId } })).toBe(2);
      expect(await reviewNotifications(userC)).toHaveLength(2);
    });

    it('catches up on a missed week for three days, then leaves it to generateForUser', async () => {
      // Week of Mon 8 - Sun 14 Jan, missed by the run on Monday the 15th.
      await activity(userC, 'suggestion_approved', '2035-01-10T12:00:00Z');

      // Friday the 19th: four days later, the window has closed.
      expect((await generation.generateDue(chathamAt('2035-01-19'))).generated).toBe(0);
      expect(await prisma.review.count({ where: { userId: userC.userId } })).toBe(2);

      // Wednesday the 17th: two days after, still inside it.
      const stats = await generation.generateDue(chathamAt('2035-01-17'));
      expect(stats.generated).toBe(1);
      const weeks = await listReviews(userC, { type: 'weekly' }).expect(200);
      expect(weeks.body.items.map((r: { periodStart: string }) => r.periodStart)).toEqual(['2035-01-08', '2034-12-25']);
      expect(await reviewNotifications(userC)).toHaveLength(3);
    });
  });

  describe('GET /reviews', () => {
    let allIds: string[];

    beforeAll(async () => {
      // Give userA five reviews, two of which (a week and a month) start on the same day, 1 January.
      await activity(userA, 'suggestion_approved', '2035-01-03T12:00:00Z');
      await activity(userA, 'suggestion_approved', '2035-01-24T12:00:00Z');
      await generation.generateForUser(userA.userId, new Date('2035-01-08T02:30:00Z')); // week 1-7 Jan
      await generation.generateForUser(userA.userId, new Date('2035-02-01T02:30:00Z')); // week 22-28 Jan, January
    });

    it('lists newest period first, breaking ties on id', async () => {
      const res = await listReviews(userA).expect(200);
      const items = res.body.items as { id: string; type: string; periodStart: string }[];
      expect(items).toHaveLength(5);
      expect(items.map((r) => r.periodStart)).toEqual([
        '2035-01-22',
        '2035-01-01',
        '2035-01-01',
        '2034-12-25',
        '2034-12-01',
      ]);
      expect(items.slice(1, 3).map((r) => r.type).sort()).toEqual(['monthly', 'weekly']);
      expect(items[1].id > items[2].id).toBe(true);
      allIds = items.map((r) => r.id);
    });

    it.each([1, 2, 3])('pages through them all with limit=%i without skipping or repeating any', async (limit) => {
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let pages = 0; pages < 10; pages += 1) {
        const res = await listReviews(userA, { limit: String(limit), ...(cursor ? { cursor } : {}) }).expect(200);
        expect(res.body.items.length).toBeLessThanOrEqual(limit);
        seen.push(...res.body.items.map((r: { id: string }) => r.id));
        cursor = res.body.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(seen).toEqual(allIds);
    });

    it('filters by type', async () => {
      const weekly = (await listReviews(userA, { type: 'weekly' }).expect(200)).body.items;
      const monthly = (await listReviews(userA, { type: 'monthly' }).expect(200)).body.items;
      expect(weekly.map((r: { type: string }) => r.type)).toEqual(['weekly', 'weekly', 'weekly']);
      expect(monthly.map((r: { periodStart: string }) => r.periodStart)).toEqual(['2035-01-01', '2034-12-01']);
    });

    it('rejects a bad type, limit or cursor', async () => {
      for (const query of [{ type: 'yearly' }, { limit: '0' }, { limit: '101' }, { limit: 'many' }, { cursor: 'not-a-cursor' }, { nope: '1' }]) {
        const res = await listReviews(userA, query).expect(400);
        expect(res.body).toMatchObject({ statusCode: 400, error: 'BAD_REQUEST' });
      }
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/reviews').expect(401);
    });

    it('only ever shows a user their own reviews', async () => {
      for (const [user, expected] of [
        [userA, 5],
        [userB, 2],
        [userC, 3],
        [userD, 0],
      ] as const) {
        const { items } = (await listReviews(user, { limit: '100' }).expect(200)).body;
        expect(items, user.email).toHaveLength(expected);
        expect(await prisma.review.count({ where: { id: { in: items.map((r: { id: string }) => r.id) }, userId: user.userId } })).toBe(expected);
      }
    });
  });

  describe('GET /reviews/:id', () => {
    it('returns one review, identical to its list entry', async () => {
      const [first] = (await listReviews(userA).expect(200)).body.items;
      const res = await request(app.getHttpServer()).get(`/api/v1/reviews/${first.id}`).set(bearer(userA.token)).expect(200);
      expect(res.body).toEqual(first);
    });

    it('is 404 for somebody else\'s review, exactly as for one that does not exist', async () => {
      const [first] = (await listReviews(userA).expect(200)).body.items;
      const other = await request(app.getHttpServer()).get(`/api/v1/reviews/${first.id}`).set(bearer(userB.token)).expect(404);
      const missing = await request(app.getHttpServer())
        .get('/api/v1/reviews/2a3b4c5d-0000-4000-8000-000000000000')
        .set(bearer(userB.token))
        .expect(404);
      expect(other.body).toEqual(missing.body);
    });

    it('is 400 for an id that is not a UUID, and 401 without a session', async () => {
      await request(app.getHttpServer()).get('/api/v1/reviews/not-a-uuid').set(bearer(userA.token)).expect(400);
      await request(app.getHttpServer()).get('/api/v1/reviews/2a3b4c5d-0000-4000-8000-000000000000').expect(401);
    });
  });
});
