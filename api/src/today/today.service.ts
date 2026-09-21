import { Injectable } from '@nestjs/common';
import { localDateInTimezone } from '../common/time/timezone.js';
import { PrismaService } from '../lib/prisma.js';
import { SignalEngineFacade } from '../signal-engine/signal-engine.facade.js';
import { TodayAggregatorService } from './today-aggregator.service.js';

@Injectable()
export class TodayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregator: TodayAggregatorService,
    private readonly signalEngine: SignalEngineFacade,
  ) {}

  /** `date` defaults to today on the user's own calendar, not the server's or UTC's. */
  async getToday(userId: string, date?: string) {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId }, select: { timezone: true } });
    const timezone = settings?.timezone ?? 'UTC';
    const resolvedDate = date ?? localDateInTimezone(new Date(), timezone);

    const [sections, inbox] = await Promise.all([
      this.aggregator.collect({ userId, date: resolvedDate, timezone }),
      this.signalEngine.inboxSummary(userId),
    ]);
    return { date: resolvedDate, timezone, sections, inbox };
  }
}
