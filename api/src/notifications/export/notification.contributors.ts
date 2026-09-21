import { Injectable } from '@nestjs/common';
import { AsExportContributor } from '../../common/export/export-contributor.decorator.js';
import type { ExportContributor } from '../../common/export/export-contributor.interface.js';
import { PrismaService } from '../../lib/prisma.js';

@Injectable()
@AsExportContributor()
export class NotificationsExportContributor implements ExportContributor {
  readonly name = 'notifications';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }
}

@Injectable()
@AsExportContributor()
export class NotificationPreferencesExportContributor implements ExportContributor {
  readonly name = 'notificationPreferences';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    const [categories, settings] = await Promise.all([
      this.prisma.notificationPreference.findMany({ where: { userId } }),
      this.prisma.notificationSettings.findUnique({ where: { userId } }),
    ]);
    return { categories, quietHours: settings ? { start: settings.quietHoursStart, end: settings.quietHoursEnd } : null };
  }
}
