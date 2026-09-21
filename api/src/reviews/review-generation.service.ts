import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdvisoryLockService } from '../common/locks/advisory-lock.service.js';
import { localParts } from '../common/time/timezone.js';
import { PrismaService } from '../lib/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import type { ReviewType } from '../generated/prisma/enums.js';
import { NotificationsFacade } from '../notifications/notifications.facade.js';
import { ReviewCollectorService } from './review-collector.service.js';
import {
  daysSincePeriodEnded,
  previousMonthPeriod,
  previousWeekPeriod,
  type ReviewPeriod,
} from './review-periods.js';

/** A user is only looked at once a day: in the hour after their local 02:00. */
export const REVIEW_LOCAL_HOUR = 2;
/** ...and only for the first few days of a new week/month, so a quiet user is not re-collected all month. */
export const REVIEW_CATCH_UP_DAYS = 3;

export interface GenerationStats {
  usersConsidered: number;
  generated: number;
  alreadyExisted: number;
  skippedNoActivity: number;
  failed: number;
}

const emptyStats = (): GenerationStats => ({
  usersConsidered: 0,
  generated: 0,
  alreadyExisted: 0,
  skippedNoActivity: 0,
  failed: 0,
});

interface UserPeriods {
  userId: string;
  timezone: string;
  periods: ReviewPeriod[];
}

const dateOnly = (date: string) => new Date(`${date}T00:00:00.000Z`);

@Injectable()
export class ReviewGenerationService {
  private readonly logger = new Logger(ReviewGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly collector: ReviewCollectorService,
    private readonly notifications: NotificationsFacade,
    private readonly locks: AdvisoryLockService,
    private readonly config: ConfigService,
  ) {}

  /**
   * The cron entry point. Exactly one API instance runs at a time (the others see the
   * advisory lock taken and return `ran: false`), and each run only looks at users
   * for whom it is currently the review hour on their own clock.
   */
  async runScheduled(now: Date = new Date()): Promise<{ ran: boolean; stats?: GenerationStats }> {
    let stats: GenerationStats | undefined;
    const ran = await this.locks.runExclusive('review-generation', async () => {
      stats = await this.generateDue(now);
    });
    return { ran, stats };
  }

  /** Users whose local clock is in the review hour right now, in keyset-paginated batches. */
  async generateDue(now: Date): Promise<GenerationStats> {
    const stats = emptyStats();
    const batchSize = this.config.get<number>('REVIEW_GENERATION_BATCH_SIZE', 100);

    const distinct = await this.prisma.userSettings.findMany({ distinct: ['timezone'], select: { timezone: true } });
    const timezones = distinct.map((row) => row.timezone).filter((timezone) => isReviewHour(now, timezone));
    if (timezones.length === 0) return stats;

    let after: string | undefined;
    for (;;) {
      const batch = await this.prisma.userSettings.findMany({
        where: { timezone: { in: timezones }, ...(after ? { userId: { gt: after } } : {}) },
        select: { userId: true, timezone: true, weekStartsOn: true },
        orderBy: { userId: 'asc' },
        take: batchSize,
      });
      if (batch.length === 0) break;

      await this.processBatch(
        batch.map(({ userId, timezone, weekStartsOn }) => ({
          userId,
          timezone,
          periods: [previousWeekPeriod(now, timezone, weekStartsOn), previousMonthPeriod(now, timezone)].filter(
            (period) => daysSincePeriodEnded(period, now, timezone) < REVIEW_CATCH_UP_DAYS,
          ),
        })),
        stats,
      );
      after = batch.at(-1)!.userId;
      if (batch.length < batchSize) break;
    }
    return stats;
  }

  /**
   * Creates whichever of the user's last complete week and month don't have a review
   * yet. Idempotent: run it as often as you like. Not gated by the review hour.
   */
  async generateForUser(userId: string, now: Date = new Date()): Promise<GenerationStats> {
    const stats = emptyStats();
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { timezone: true, weekStartsOn: true },
    });
    const timezone = settings?.timezone ?? 'UTC';
    await this.processBatch(
      [
        {
          userId,
          timezone,
          periods: [previousWeekPeriod(now, timezone, settings?.weekStartsOn ?? 1), previousMonthPeriod(now, timezone)],
        },
      ],
      stats,
    );
    return stats;
  }

  private async processBatch(users: UserPeriods[], stats: GenerationStats): Promise<void> {
    stats.usersConsidered += users.length;
    const candidates = users.flatMap((user) => user.periods.map((period) => ({ user, period })));
    if (candidates.length === 0) return;

    // One query for the whole batch tells us which reviews already exist.
    const existing = await this.prisma.review.findMany({
      where: {
        OR: candidates.map(({ user, period }) => ({
          userId: user.userId,
          type: period.type,
          periodStart: dateOnly(period.startDate),
        })),
      },
      select: { userId: true, type: true, periodStart: true },
    });
    const key = (userId: string, type: ReviewType, startDate: string) => `${userId}|${type}|${startDate}`;
    const have = new Set(existing.map((row) => key(row.userId, row.type, row.periodStart.toISOString().slice(0, 10))));

    for (const { user, period } of candidates) {
      if (have.has(key(user.userId, period.type, period.startDate))) {
        stats.alreadyExisted += 1;
        continue;
      }
      try {
        await this.generateOne(user.userId, user.timezone, period, stats);
      } catch {
        // One user's failure must not stop the batch. Ids only: nothing here is user data.
        stats.failed += 1;
        this.logger.warn(`Could not generate the ${period.type} review starting ${period.startDate} for user ${user.userId}`);
      }
    }
  }

  private async generateOne(userId: string, timezone: string, period: ReviewPeriod, stats: GenerationStats): Promise<void> {
    const collected = await this.collector.collect({
      userId,
      type: period.type,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      startDate: period.startDate,
      endDate: period.endDate,
      timezone,
    });
    if (!collected.hasActivity) {
      stats.skippedNoActivity += 1;
      return;
    }

    let review;
    try {
      review = await this.prisma.review.create({
        data: {
          userId,
          type: period.type,
          periodStart: dateOnly(period.startDate),
          periodEnd: dateOnly(period.endDate),
          timezone,
          sections: collected.sections as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      // Lost a race with another generator: the review exists, which is what we wanted.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        stats.alreadyExisted += 1;
        return;
      }
      throw error;
    }
    stats.generated += 1;

    try {
      await this.notifications.notify({
        userId,
        category: 'review_ready',
        title: period.type === 'weekly' ? 'Your weekly review is ready' : 'Your monthly review is ready',
        body: `${period.startDate} to ${period.endDate}`,
        data: { reviewId: review.id, type: period.type, periodStart: period.startDate, periodEnd: period.endDate },
        dedupeKey: `review:${period.type}:${period.startDate}`,
      });
    } catch {
      // The review exists and is in GET /reviews; a failed notification must not undo that.
      this.logger.warn(`Review ${review.id} was created but notifying user ${userId} failed`);
    }
  }
}

/** True when it is currently the review hour on the wall clock of `timezone`. */
export function isReviewHour(now: Date, timezone: string, hour: number = REVIEW_LOCAL_HOUR): boolean {
  try {
    return localParts(now, timezone).hour === hour;
  } catch {
    return false; // an unknown timezone name: skip the user rather than fail the run
  }
}
