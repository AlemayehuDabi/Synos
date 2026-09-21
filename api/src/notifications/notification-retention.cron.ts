import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service.js';

@Injectable()
export class NotificationRetentionCron {
  private readonly logger = new Logger(NotificationRetentionCron.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @Cron('0 30 3 * * *')
  async pruneRead(): Promise<void> {
    const days = this.config.get<number>('NOTIFICATION_RETENTION_DAYS', 90);
    const pruned = await this.notifications.pruneRead(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
    if (pruned > 0) this.logger.log(`Pruned ${pruned} read notification(s) older than ${days} days`);
  }
}
