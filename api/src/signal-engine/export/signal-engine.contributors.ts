import { Injectable } from '@nestjs/common';
import { AsExportContributor } from '../../common/export/export-contributor.decorator.js';
import type { ExportContributor } from '../../common/export/export-contributor.interface.js';
import { PrismaService } from '../../lib/prisma.js';

@Injectable()
@AsExportContributor()
export class SignalsExportContributor implements ExportContributor {
  readonly name = 'signals';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.signal.findMany({ where: { userId }, orderBy: { occurredAt: 'asc' } });
  }
}

@Injectable()
@AsExportContributor()
export class SuggestionsExportContributor implements ExportContributor {
  readonly name = 'suggestions';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.suggestion.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }
}

@Injectable()
@AsExportContributor()
export class ConnectionSettingsExportContributor implements ExportContributor {
  readonly name = 'connectionSettings';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.connectionSetting.findMany({ where: { userId } });
  }
}

@Injectable()
@AsExportContributor()
export class ActivityLogExportContributor implements ExportContributor {
  readonly name = 'activityLog';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.activityLog.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }
}
