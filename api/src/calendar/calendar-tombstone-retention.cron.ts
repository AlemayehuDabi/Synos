import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../lib/prisma.js';

@Injectable()
export class CalendarTombstoneRetentionCron {
  private readonly logger = new Logger(CalendarTombstoneRetentionCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Daily. Hard-deletes tombstoned events (and, via cascade, their exceptions) past the retention window. */
  @Cron('0 45 3 * * *')
  async purge(): Promise<void> {
    const days = this.config.get<number>('CALENDAR_TOMBSTONE_RETENTION_DAYS', 90);
    const deletedBefore = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await this.prisma.calendarEvent.deleteMany({ where: { deletedAt: { not: null, lt: deletedBefore } } });
    if (result.count > 0) this.logger.log(`Purged ${result.count} tombstoned calendar event(s) older than ${days} days`);
  }
}
