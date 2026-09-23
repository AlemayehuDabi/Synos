import { Injectable } from '@nestjs/common';
import { AsExportContributor } from '../../common/export/export-contributor.decorator.js';
import type { ExportContributor } from '../../common/export/export-contributor.interface.js';
import { PrismaService } from '../../lib/prisma.js';

@Injectable()
@AsExportContributor()
export class HabitsExportContributor implements ExportContributor {
  readonly name = 'habits';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.habit.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }
}

@Injectable()
@AsExportContributor()
export class HabitEntriesExportContributor implements ExportContributor {
  readonly name = 'habitEntries';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.habitEntry.findMany({ where: { userId }, orderBy: { date: 'asc' } });
  }
}
