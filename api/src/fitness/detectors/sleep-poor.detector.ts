import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { localDateInTimezone } from '../../common/time/timezone.js';
import { PrismaService } from '../../lib/prisma.js';
import { SignalDetector } from '../../signal-engine/registry/index.js';
import { SignalEngineFacade } from '../../signal-engine/signal-engine.facade.js';
import { summarizeSleepNights } from '../sleep.js';
import { timezonesFor } from './timezones.js';

/** Wide enough that a night ending "today" is always inside it, whatever the user's timezone. */
const LOOKBACK_MS = 48 * 60 * 60_000;

/**
 * Emits `sleep.poor` for a user whose sleep in the night that ended on their local
 * today is under FITNESS_SLEEP_POOR_THRESHOLD_MIN. At most once per day per user: the
 * signal's dedupeKey is the wake-up date, so every later tick that day is a no-op at the engine.
 */
@Injectable()
@SignalDetector({ name: 'fitness-sleep-poor', cron: '0 20 * * * *' })
export class SleepPoorDetector implements SignalDetector {
  private readonly logger = new Logger(SleepPoorDetector.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signalEngine: SignalEngineFacade,
    private readonly config: ConfigService,
  ) {}

  async run(): Promise<void> {
    const now = new Date();
    const thresholdMinutes = this.config.get<number>('FITNESS_SLEEP_POOR_THRESHOLD_MIN', 360);
    const rows = await this.prisma.wearableSample.findMany({
      where: { type: 'sleep', endsAt: { gte: new Date(now.getTime() - LOOKBACK_MS) } },
      select: { userId: true, startsAt: true, endsAt: true, value: true },
    });

    const byUser = new Map<string, typeof rows>();
    for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
    const timezones = await timezonesFor(this.prisma, [...byUser.keys()]);

    for (const [userId, samples] of byUser) {
      const timezone = timezones.get(userId) ?? 'UTC';
      const today = localDateInTimezone(now, timezone);
      const night = summarizeSleepNights(samples, timezone, thresholdMinutes).find((n) => n.date === today);
      if (!night?.poor) continue;

      try {
        // eslint-disable-next-line no-await-in-loop
        await this.signalEngine.emit({
          userId,
          type: 'sleep.poor',
          payload: { date: night.date, durationMinutes: night.durationMinutes },
          dedupeKey: `sleep-poor:${night.date}`,
        });
      } catch (error) {
        // Ids only: never log health data.
        this.logger.warn(`Could not emit sleep.poor for user ${userId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}
