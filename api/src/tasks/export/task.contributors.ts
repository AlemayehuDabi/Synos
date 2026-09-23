import { Injectable } from '@nestjs/common';
import { AsExportContributor } from '../../common/export/export-contributor.decorator.js';
import type { ExportContributor } from '../../common/export/export-contributor.interface.js';
import { PrismaService } from '../../lib/prisma.js';

@Injectable()
@AsExportContributor()
export class TasksExportContributor implements ExportContributor {
  readonly name = 'tasks';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.task.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }
}

@Injectable()
@AsExportContributor()
export class TaskExceptionsExportContributor implements ExportContributor {
  readonly name = 'taskExceptions';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.taskException.findMany({ where: { task: { userId } }, orderBy: { originalDueAt: 'asc' } });
  }
}

@Injectable()
@AsExportContributor()
export class SubtasksExportContributor implements ExportContributor {
  readonly name = 'subtasks';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.subtask.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }
}
