import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { addDaysToDate, localDateInTimezone, startOfLocalDay } from '../../common/time/timezone.js';
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
import { recoveryTargetKey } from '../task.service.js';

const ACTION_TYPE = 'tasks.adjust-load';
/** Pushed later by this many minutes, and given this much less estimated time, when the day's load is softened. */
const DELAY_MINUTES = 120;
const ESTIMATE_FACTOR = 0.75;

/**
 * Softens today's task load after poor sleep or a heavy training block: one proposal per
 * affected task (never a critical one), each independently approvable/revertible and
 * keyed by that task's own `recoveryTargetKey` - the same key TaskService checks a manual
 * edit against, so "manual edits/completion are ground truth" holds per task, not per day.
 */
@Injectable()
@ConnectionRule('recovery-to-task-load')
export class RecoveryToTaskLoadRule implements ConnectionRule {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(ctx: RuleContext): Promise<ProposalDraft[]> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId: ctx.userId }, select: { timezone: true } });
    const timezone = settings?.timezone ?? 'UTC';
    const today = localDateInTimezone(ctx.now, timezone);
    const from = startOfLocalDay(today, timezone);
    const to = startOfLocalDay(addDaysToDate(today, 1), timezone);

    const tasks = await this.prisma.task.findMany({
      where: {
        userId: ctx.userId,
        deletedAt: null,
        status: 'open',
        isCritical: false,
        OR: [{ dueAt: { gte: from, lt: to } }, { scheduledStart: { gte: from, lt: to } }],
      },
    });

    return tasks.map((task) => ({
      title: `Lighten load: ${task.title}`,
      body: task.scheduledStart
        ? `Push back ${DELAY_MINUTES} minutes and trim the estimate.`
        : 'Trim the estimate for today.',
      actionType: ACTION_TYPE,
      params: { taskId: task.id },
      targetKey: recoveryTargetKey(task.id),
      dedupeKey: `${ctx.signal.id}:${ACTION_TYPE}:${task.id}`,
    }));
  }
}

const paramsSchema = z.object({ taskId: z.string().min(1) });
type Params = z.infer<typeof paramsSchema>;

@Injectable()
@ActionHandler(ACTION_TYPE)
export class RecoveryToTaskLoadHandler implements ActionHandler<Params> {
  readonly actionType = ACTION_TYPE;
  readonly targetDomain = 'tasks';
  readonly paramsSchema = paramsSchema;
  readonly supportsRevert = true;

  async apply(ctx: ActionHandlerContext, params: Params): Promise<ApplyResult> {
    const task = await ctx.tx.task.findUnique({ where: { id: params.taskId } });
    if (!task || task.deletedAt || task.userId !== ctx.userId) return { outcome: 'noop', reason: 'Task no longer exists' };
    if (task.status !== 'open') return { outcome: 'noop', reason: 'Task is no longer open' };
    if (task.isCritical) return { outcome: 'noop', reason: 'Task is critical; never adjusted' };

    const before = { scheduledStart: task.scheduledStart, scheduledEnd: task.scheduledEnd, estimatedMinutes: task.estimatedMinutes };
    const delayMs = DELAY_MINUTES * 60_000;
    const scheduledStart = task.scheduledStart ? new Date(task.scheduledStart.getTime() + delayMs) : null;
    const scheduledEnd = task.scheduledEnd ? new Date(task.scheduledEnd.getTime() + delayMs) : null;
    const estimatedMinutes = task.estimatedMinutes ? Math.round(task.estimatedMinutes * ESTIMATE_FACTOR) : task.estimatedMinutes;
    const after = { scheduledStart, scheduledEnd, estimatedMinutes };

    await ctx.tx.task.update({ where: { id: task.id }, data: after });
    return { outcome: 'applied', entityRef: { type: 'task', id: task.id }, before, after, revertData: { taskId: task.id, ...before } };
  }

  async revert(ctx: ActionHandlerContext, revertData: unknown): Promise<RevertResult> {
    // revertData round-trips through the Suggestion row's JSON column, so Date fields come
    // back as ISO strings, not Date instances - parse them back before doing date arithmetic.
    const raw = revertData as { taskId: string; scheduledStart: string | null; scheduledEnd: string | null; estimatedMinutes: number | null };
    const scheduledStart = raw.scheduledStart ? new Date(raw.scheduledStart) : null;
    const scheduledEnd = raw.scheduledEnd ? new Date(raw.scheduledEnd) : null;

    const task = await ctx.tx.task.findUnique({ where: { id: raw.taskId } });
    if (!task || task.deletedAt) return { outcome: 'reverted' };

    const delayMs = DELAY_MINUTES * 60_000;
    const expectedScheduledStart = scheduledStart ? new Date(scheduledStart.getTime() + delayMs) : null;
    const expectedEstimate = raw.estimatedMinutes ? Math.round(raw.estimatedMinutes * ESTIMATE_FACTOR) : raw.estimatedMinutes;
    const unchanged =
      task.scheduledStart?.getTime() === expectedScheduledStart?.getTime() && task.estimatedMinutes === expectedEstimate;
    if (!unchanged) return { outcome: 'conflict', reason: 'The task has since been changed' };

    await ctx.tx.task.update({
      where: { id: raw.taskId },
      data: { scheduledStart, scheduledEnd, estimatedMinutes: raw.estimatedMinutes },
    });
    return { outcome: 'reverted' };
  }
}
