import { Injectable } from '@nestjs/common';
import { addDaysToDate, daysBetweenDates, localDateInTimezone, startOfLocalDay } from '../common/time/timezone.js';
import { PrismaService } from '../lib/prisma.js';
import { TodayContributor, type TodayContext, type TodayContribution, type TodayItem } from '../today/today-contributor.js';
import { workoutTemplateSchema } from './program-template.js';
import { workoutDurationMinutes } from './training-load.js';

const titleCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Today's completed and in-progress workouts, plus what the active program has planned for today. */
@Injectable()
@TodayContributor('fitness')
export class FitnessTodayContributor implements TodayContributor {
  constructor(private readonly prisma: PrismaService) {}

  async collect({ userId, date, timezone }: TodayContext): Promise<TodayContribution> {
    const dayStart = startOfLocalDay(date, timezone);
    const dayEnd = startOfLocalDay(addDaysToDate(date, 1), timezone);

    const [workouts, program] = await Promise.all([
      this.prisma.workout.findMany({
        where: {
          userId,
          deletedAt: null,
          OR: [
            { completedAt: { gte: dayStart, lt: dayEnd } },
            { completedAt: null, startedAt: { gte: dayStart, lt: dayEnd } },
          ],
        },
        orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.program.findFirst({ where: { userId, isActive: true, activatedAt: { not: null } }, include: { workouts: true } }),
    ]);

    const items: TodayItem[] = workouts.map((workout) => ({
      id: workout.id,
      title: workout.title ?? titleCase(workout.workoutType),
      kind: workout.completedAt ? 'completed' : 'in_progress',
      workoutType: workout.workoutType,
      durationMinutes: workout.completedAt || workout.durationMinutes != null ? workoutDurationMinutes(workout) : null,
      startedAt: workout.startedAt.toISOString(),
      completedAt: workout.completedAt?.toISOString() ?? null,
    }));

    let planned = 0;
    const alreadyDone = program ? workouts.some((workout) => workout.completedAt && workout.programId === program.id) : false;
    if (program?.activatedAt && !alreadyDone) {
      const dayOffset = daysBetweenDates(localDateInTimezone(program.activatedAt, timezone), date);
      for (const session of program.workouts.filter((w) => w.dayOffset === dayOffset)) {
        const template = workoutTemplateSchema.safeParse(session.workoutTemplate);
        if (!template.success) continue;
        planned += 1;
        items.push({
          id: session.id,
          title: template.data.title ?? titleCase(template.data.workoutType),
          kind: 'planned',
          workoutType: template.data.workoutType,
          durationMinutes: template.data.durationMinutes ?? null,
          startedAt: null,
          completedAt: null,
          programId: program.id,
        });
      }
    }

    const completed = workouts.filter((workout) => workout.completedAt);
    return {
      summary: {
        completed: completed.length,
        inProgress: workouts.length - completed.length,
        planned,
        totalMinutes: completed.reduce((sum, workout) => sum + workoutDurationMinutes(workout), 0),
      },
      items,
    };
  }
}
