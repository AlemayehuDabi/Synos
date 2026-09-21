import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataExportService } from './data-export.service.js';

@Injectable()
export class ExportCleanupCron {
  private readonly logger = new Logger(ExportCleanupCron.name);

  constructor(private readonly dataExportService: DataExportService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredExports(): Promise<void> {
    const count = await this.dataExportService.expireStaleJobs();
    if (count > 0) {
      this.logger.log(`Expired ${count} stale export job(s)`);
    }
  }
}
