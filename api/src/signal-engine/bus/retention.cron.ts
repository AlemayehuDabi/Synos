import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../lib/prisma.js';
import { SuggestionsService } from '../services/suggestions.service.js';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

@Injectable()
export class RetentionCron {
  private readonly logger = new Logger(RetentionCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly suggestionsService: SuggestionsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async expirePendingSuggestions(): Promise<void> {
    const count = await this.suggestionsService.expirePending();
    if (count > 0) {
      this.logger.log(`Expired ${count} pending suggestion(s) past their expiresAt`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneOldRecords(): Promise<void> {
    const signalRetentionDays = this.configService.get<number>('SIGNAL_RETENTION_DAYS', 180);
    const suggestionRetentionDays = this.configService.get<number>('SUGGESTION_RETENTION_DAYS', 180);
    const activityRetentionDays = this.configService.get<number>('ACTIVITY_RETENTION_DAYS', 730);

    const [signals, suggestions, activity] = await Promise.all([
      this.prisma.signal.deleteMany({
        where: { processedAt: { not: null, lt: daysAgo(signalRetentionDays) } },
      }),
      this.prisma.suggestion.deleteMany({
        where: { status: { notIn: ['pending'] }, resolvedAt: { lt: daysAgo(suggestionRetentionDays) } },
      }),
      this.prisma.activityLog.deleteMany({
        where: { createdAt: { lt: daysAgo(activityRetentionDays) } },
      }),
    ]);

    this.logger.log(
      `Retention: pruned ${signals.count} signal(s), ${suggestions.count} suggestion(s), ${activity.count} activity log(s)`,
    );
  }
}
