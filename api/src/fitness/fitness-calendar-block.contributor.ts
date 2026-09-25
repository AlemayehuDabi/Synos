import { Injectable } from '@nestjs/common';
import {
  CalendarBlockContributor,
  type Block,
  type CalendarBlockContext,
  type CalendarBlockContributor as CalendarBlockContributorInterface,
} from '../calendar/calendar-block-contributor.js';
import { PrismaService } from '../lib/prisma.js';
import { FitnessPrivacyService } from './fitness-privacy.service.js';

/** No workout lasts longer than this, so one that started earlier than this before the window can't reach it. */
const MAX_WORKOUT_MS = 24 * 60 * 60_000;

/**
 * Workouts as busy blocks, from startedAt to completedAt (or startedAt plus its recorded
 * duration); one with no known end takes no time on the calendar. With fitness private (the
 * default) another domain only learns that the time is taken: a generic title and no link back.
 */
@Injectable()
@CalendarBlockContributor('fitness')
export class FitnessCalendarBlockContributor implements CalendarBlockContributorInterface {
  constructor(
    private readonly prisma: PrismaService,
    private readonly privacy: FitnessPrivacyService,
  ) {}

  async collect({ userId, from, to }: CalendarBlockContext): Promise<Block[]> {
    const [workouts, shared] = await Promise.all([
      this.prisma.workout.findMany({
        where: { userId, deletedAt: null, startedAt: { gte: new Date(from.getTime() - MAX_WORKOUT_MS), lt: to } },
        orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      }),
      this.privacy.isShared(userId),
    ]);

    const blocks: Block[] = [];
    for (const workout of workouts) {
      const endsAt =
        workout.completedAt ?? (workout.durationMinutes != null ? new Date(workout.startedAt.getTime() + workout.durationMinutes * 60_000) : null);
      if (!endsAt || endsAt <= workout.startedAt || endsAt <= from) continue;

      blocks.push({
        id: workout.id,
        domain: 'fitness',
        title: shared ? (workout.title ?? workout.workoutType) : 'Workout',
        startsAt: workout.startedAt,
        endsAt,
        allDay: false,
        busy: true,
        ...(shared ? { ref: { workoutId: workout.id } } : {}),
      });
    }
    return blocks;
  }
}
