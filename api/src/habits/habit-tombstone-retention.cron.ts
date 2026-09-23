import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../lib/prisma.js';

@Injectable()
export class HabitTombstoneRetentionCron {
  private readonly logger = new Logger(HabitTombstoneRetentionCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Daily. Hard-deletes tombstoned habits (and, via cascade, their entries) past the
   * retention window, plus any entry tombstoned on its own (its habit still active).
   */
  @Cron('0 55 3 * * *')
  async purge(): Promise<void> {
    const days = this.config.get<number>('HABITS_TOMBSTONE_RETENTION_DAYS', 90);
    const deletedBefore = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [habits, entries] = await Promise.all([
      this.prisma.habit.deleteMany({ where: { deletedAt: { not: null, lt: deletedBefore } } }),
      this.prisma.habitEntry.deleteMany({ where: { deletedAt: { not: null, lt: deletedBefore } } }),
    ]);
    if (habits.count > 0) this.logger.log(`Purged ${habits.count} tombstoned habit(s) older than ${days} days`);
    if (entries.count > 0) this.logger.log(`Purged ${entries.count} tombstoned habit entr${entries.count === 1 ? 'y' : 'ies'} older than ${days} days`);
  }
}
