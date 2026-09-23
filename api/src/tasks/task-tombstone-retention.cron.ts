import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../lib/prisma.js';

@Injectable()
export class TaskTombstoneRetentionCron {
  private readonly logger = new Logger(TaskTombstoneRetentionCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Daily. Hard-deletes tombstoned tasks (and, via cascade, their exceptions/subtasks) past the retention window. */
  @Cron('0 50 3 * * *')
  async purge(): Promise<void> {
    const days = this.config.get<number>('TASKS_TOMBSTONE_RETENTION_DAYS', 90);
    const deletedBefore = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await this.prisma.task.deleteMany({ where: { deletedAt: { not: null, lt: deletedBefore } } });
    if (result.count > 0) this.logger.log(`Purged ${result.count} tombstoned task(s) older than ${days} days`);
  }
}
