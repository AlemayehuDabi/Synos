import { Injectable } from '@nestjs/common';
import { addDaysToDate, startOfLocalDay } from '../common/time/timezone.js';
import { PrismaService } from '../lib/prisma.js';
import { TodayContributor, type TodayContext, type TodayContribution } from '../today/today-contributor.js';

@Injectable()
@TodayContributor('tasks')
export class TaskTodayContributor implements TodayContributor {
  constructor(private readonly prisma: PrismaService) {}

  async collect({ userId, date, timezone }: TodayContext): Promise<TodayContribution> {
    const todayStart = startOfLocalDay(date, timezone);
    const todayEnd = startOfLocalDay(addDaysToDate(date, 1), timezone);

    const tasks = await this.prisma.task.findMany({
      where: {
        userId,
        deletedAt: null,
        status: 'open',
        OR: [
          { dueAt: { lt: todayEnd } }, // due today or overdue
          { scheduledStart: { gte: todayStart, lt: todayEnd } },
        ],
      },
      orderBy: [{ dueAt: 'asc' }, { scheduledStart: 'asc' }],
    });

    let dueToday = 0;
    let overdue = 0;
    let scheduledToday = 0;
    for (const task of tasks) {
      if (task.dueAt && task.dueAt < todayStart) overdue += 1;
      else if (task.dueAt && task.dueAt < todayEnd) dueToday += 1;
      if (task.scheduledStart && task.scheduledStart >= todayStart && task.scheduledStart < todayEnd) scheduledToday += 1;
    }

    return {
      summary: { dueToday, overdue, scheduledToday },
      items: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        priority: task.priority,
        dueAt: task.dueAt?.toISOString() ?? null,
        scheduledStart: task.scheduledStart?.toISOString() ?? null,
        scheduledEnd: task.scheduledEnd?.toISOString() ?? null,
        isCritical: task.isCritical,
        overdue: Boolean(task.dueAt && task.dueAt < todayStart),
      })),
    };
  }
}
