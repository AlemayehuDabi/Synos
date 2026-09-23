import { Injectable } from '@nestjs/common';
import { z } from 'zod';
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
import type { HabitSchedule } from '../../generated/prisma/enums.js';

const ACTION_TYPE = 'habits.create-from-pattern';

/** `habit-pattern:<fingerprint>` - namespaced separately from Tasks' own `task-pattern:<fingerprint>` targetKey (that one guards re-emitting the signal; this one guards this connection's own suggestion). */
export const patternHabitTargetKey = (fingerprint: string): string => `habit-pattern:${fingerprint}`;

interface TaskRecurringPatternPayload {
  fingerprint: string;
  occurrences: number;
  cadenceDays: number;
  taskIds: string[];
}

/** Infers a habit schedule from how often the pattern recurs; the detector's own cadence is only ever approximate. */
export function inferScheduleFromCadence(cadenceDays: number): { schedule: HabitSchedule; targetPerPeriod: number | null } {
  if (cadenceDays <= 1) return { schedule: 'daily', targetPerPeriod: null };
  if (cadenceDays <= 9) return { schedule: 'weekly', targetPerPeriod: null };
  return { schedule: 'timesPerMonth', targetPerPeriod: 1 };
}

/** Offers to turn a detected recurring (non-recurring, repeatedly-created) task pattern into a real habit. */
@Injectable()
@ConnectionRule('recurring-task-to-habit')
export class RecurringTaskToHabitRule implements ConnectionRule {
  async evaluate(ctx: RuleContext): Promise<ProposalDraft[]> {
    const payload = ctx.signal.payload as TaskRecurringPatternPayload;
    const title = payload.fingerprint.charAt(0).toUpperCase() + payload.fingerprint.slice(1);
    return [
      {
        title: `Turn "${title}" into a habit?`,
        body: `You've created this task ${payload.occurrences} times, roughly every ${payload.cadenceDays} day(s).`,
        actionType: ACTION_TYPE,
        params: { title, cadenceDays: payload.cadenceDays },
        targetKey: patternHabitTargetKey(payload.fingerprint),
        dedupeKey: `${ctx.signal.id}:${ACTION_TYPE}`,
      },
    ];
  }
}

const paramsSchema = z.object({ title: z.string().min(1), cadenceDays: z.number().int().positive() });
type Params = z.infer<typeof paramsSchema>;

@Injectable()
@ActionHandler(ACTION_TYPE)
export class RecurringTaskToHabitHandler implements ActionHandler<Params> {
  readonly actionType = ACTION_TYPE;
  readonly targetDomain = 'habits';
  readonly paramsSchema = paramsSchema;
  readonly supportsRevert = true;

  constructor(private readonly prisma: PrismaService) {}

  async apply(ctx: ActionHandlerContext, params: Params): Promise<ApplyResult> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId: ctx.userId }, select: { timezone: true } });
    const { schedule, targetPerPeriod } = inferScheduleFromCadence(params.cadenceDays);
    const habit = await ctx.tx.habit.create({
      data: {
        userId: ctx.userId,
        title: params.title,
        type: 'build',
        schedule,
        targetPerPeriod,
        timezone: settings?.timezone ?? 'UTC',
        source: ctx.source, // 'suggestion' (manually approved) or 'auto'
      },
    });
    return {
      outcome: 'applied',
      entityRef: { type: 'habit', id: habit.id },
      before: null,
      after: { habitId: habit.id, title: habit.title },
      revertData: { habitId: habit.id },
    };
  }

  async revert(ctx: ActionHandlerContext, revertData: unknown): Promise<RevertResult> {
    const { habitId } = revertData as { habitId: string };
    const habit = await ctx.tx.habit.findUnique({ where: { id: habitId } });
    if (!habit || habit.deletedAt) return { outcome: 'reverted' }; // already gone: nothing to do
    // "Untouched" = never written to since the create() above, which itself sets updatedAt == createdAt.
    if (habit.updatedAt.getTime() !== habit.createdAt.getTime()) {
      return { outcome: 'conflict', reason: 'The habit has since been changed' };
    }
    await ctx.tx.habit.update({ where: { id: habitId }, data: { isArchived: true, archivedAt: new Date() } });
    return { outcome: 'reverted' };
  }
}
