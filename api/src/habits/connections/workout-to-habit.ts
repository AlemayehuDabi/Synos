import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { localDateInTimezone, startOfLocalDay } from '../../common/time/timezone.js';
import { PrismaService } from '../../lib/prisma.js';
import {
  ActionHandler,
  ConnectionRule,
  type ActionHandlerContext,
  type ApplyResult,
  type ProposalDraft,
  type RevertResult,
  type RuleContext,
} from '../../signal-engine/registry/index.js';
import { habitTargetKey } from '../habit-entry.service.js';

const ACTION_TYPE = 'habits.log-workout-entry';

interface WorkoutCompletedPayload {
  workoutId: string;
  completedAt: string;
  durationMinutes: number;
  workoutType: string;
}

/**
 * Checks off the matching exercise habit when a workout is completed. "Matching" is the
 * user's own active build habit whose title mentions the workout type (e.g. workoutType
 * "run" matches a habit titled "Go for a run") - there is no other link between a workout
 * and a habit anywhere in the data. Proposes nothing when no such habit exists.
 */
@Injectable()
@ConnectionRule('workout-to-habit')
export class WorkoutToHabitRule implements ConnectionRule {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(ctx: RuleContext): Promise<ProposalDraft[]> {
    const payload = ctx.signal.payload as WorkoutCompletedPayload;
    const habit = await this.prisma.habit.findFirst({
      where: {
        userId: ctx.userId,
        deletedAt: null,
        isArchived: false,
        type: 'build',
        title: { contains: payload.workoutType, mode: 'insensitive' },
      },
    });
    if (!habit) return [];

    const date = localDateInTimezone(new Date(payload.completedAt), habit.timezone);
    return [
      {
        title: `Log "${habit.title}"`,
        body: `Completed a ${payload.durationMinutes} minute ${payload.workoutType}.`,
        actionType: ACTION_TYPE,
        params: { habitId: habit.id, date },
        targetKey: habitTargetKey(habit.id, date),
        dedupeKey: `${ctx.signal.id}:${ACTION_TYPE}`,
      },
    ];
  }
}

const paramsSchema = z.object({ habitId: z.string().min(1), date: z.iso.date() });
type Params = z.infer<typeof paramsSchema>;

@Injectable()
@ActionHandler(ACTION_TYPE)
export class WorkoutToHabitHandler implements ActionHandler<Params> {
  readonly actionType = ACTION_TYPE;
  readonly targetDomain = 'habits';
  readonly paramsSchema = paramsSchema;
  readonly supportsRevert = true;

  async apply(ctx: ActionHandlerContext, params: Params): Promise<ApplyResult> {
    const habit = await ctx.tx.habit.findUnique({ where: { id: params.habitId } });
    if (!habit || habit.deletedAt || habit.userId !== ctx.userId) return { outcome: 'noop', reason: 'Habit no longer exists' };

    const at = startOfLocalDay(params.date, 'UTC');
    const existing = await ctx.tx.habitEntry.findUnique({ where: { habitId_date: { habitId: params.habitId, date: at } } });
    // Manual check-ins are ground truth: an auto entry never overwrites one.
    if (existing && existing.source !== 'auto') return { outcome: 'conflict', reason: 'A manual entry already exists for this date' };

    const entry = await ctx.tx.habitEntry.upsert({
      where: { habitId_date: { habitId: params.habitId, date: at } },
      create: { habitId: params.habitId, userId: ctx.userId, date: at, status: 'done', source: 'auto' },
      update: { status: 'done', note: null, source: 'auto', deletedAt: null },
    });
    return {
      outcome: 'applied',
      entityRef: { type: 'habit-entry', id: entry.id },
      before: existing ? { status: existing.status } : null,
      after: { status: 'done' },
      revertData: { entryId: entry.id },
    };
  }

  async revert(ctx: ActionHandlerContext, revertData: unknown): Promise<RevertResult> {
    const { entryId } = revertData as { entryId: string };
    const entry = await ctx.tx.habitEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.deletedAt) return { outcome: 'reverted' }; // already gone: nothing to do
    if (entry.source !== 'auto') return { outcome: 'conflict', reason: 'The entry has since been changed' };
    await ctx.tx.habitEntry.update({ where: { id: entryId }, data: { deletedAt: new Date() } });
    return { outcome: 'reverted' };
  }
}
