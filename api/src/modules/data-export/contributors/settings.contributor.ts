import { Injectable } from '@nestjs/common';
import { AsExportContributor } from '../../../common/export/export-contributor.decorator.js';
import type { ExportContributor } from '../../../common/export/export-contributor.interface.js';
import { PrismaService } from '../../../lib/prisma.js';

@Injectable()
@AsExportContributor()
export class SettingsExportContributor implements ExportContributor {
  readonly name = 'settings';

  constructor(private readonly prisma: PrismaService) {}

  async collect(userId: string) {
    return this.prisma.userSettings.findUnique({ where: { userId } });
  }
}
