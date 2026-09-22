import { Injectable } from '@nestjs/common';
import { AsExportContributor } from '../../common/export/export-contributor.decorator.js';
import type { ExportContributor } from '../../common/export/export-contributor.interface.js';
import { PrismaService } from '../../lib/prisma.js';

@Injectable()
@AsExportContributor()
export class CalendarEventsExportContributor implements ExportContributor {
  readonly name = 'calendarEvents';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.calendarEvent.findMany({ where: { userId }, orderBy: { startsAt: 'asc' } });
  }
}

@Injectable()
@AsExportContributor()
export class CalendarEventExceptionsExportContributor implements ExportContributor {
  readonly name = 'calendarEventExceptions';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.calendarEventException.findMany({
      where: { event: { userId } },
      orderBy: { originalStart: 'asc' },
    });
  }
}
