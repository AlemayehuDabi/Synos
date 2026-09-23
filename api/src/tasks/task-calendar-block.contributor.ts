import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CalendarBlockContributor, type Block, type CalendarBlockContext, type CalendarBlockContributor as CalendarBlockContributorInterface } from '../calendar/calendar-block-contributor.js';
import { PrismaService } from '../lib/prisma.js';
import { expandTaskOccurrences } from './recurrence/task-occurrences.js';

/** Scheduled tasks (scheduledStart/End set) as busy blocks; an unscheduled task is never a block. */
@Injectable()
@CalendarBlockContributor('tasks')
export class TaskCalendarBlockContributor implements CalendarBlockContributorInterface {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async collect({ userId, from, to }: CalendarBlockContext): Promise<Block[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        userId,
        deletedAt: null,
        status: 'open',
        scheduledStart: { not: null },
        OR: [
          { rrule: null, scheduledEnd: { gt: from }, scheduledStart: { lt: to } },
          { rrule: { not: null }, scheduledStart: { lt: to }, OR: [{ seriesUntil: null }, { seriesUntil: { gte: from } }] },
        ],
      },
      include: { exceptions: true },
    });

    const budget = { remaining: this.config.get<number>('CALENDAR_MAX_OCCURRENCES_PER_QUERY', 2000) };
    const blocks: Block[] = [];
    for (const task of tasks) {
      for (const occurrence of expandTaskOccurrences(task, task.exceptions, { from, to, budget })) {
        if (!occurrence.scheduledStart || !occurrence.scheduledEnd) continue;
        blocks.push({
          id: `${task.id}:${occurrence.originalDueAt.getTime()}`,
          domain: 'tasks',
          title: occurrence.title,
          startsAt: occurrence.scheduledStart,
          endsAt: occurrence.scheduledEnd,
          allDay: false,
          busy: true,
          ref: { taskId: task.id },
        });
      }
    }
    return blocks;
  }
}
