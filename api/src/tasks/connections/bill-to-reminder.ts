import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  ActionHandler,
  ConnectionRule,
  type ActionHandlerContext,
  type ApplyResult,
  type ProposalDraft,
  type RevertResult,
  type RuleContext,
} from '../../signal-engine/registry/index.js';

const ACTION_TYPE = 'tasks.create-bill-reminder';

interface BillDuePayload {
  billId: string;
  dueDate: string;
  amountCents: number;
  currency: string;
  daysUntilDue: number;
}

/** Creates a reminder task ahead of an upcoming bill due date. */
@Injectable()
@ConnectionRule('bill-to-reminder')
export class BillToReminderRule implements ConnectionRule {
  async evaluate(ctx: RuleContext): Promise<ProposalDraft[]> {
    const payload = ctx.signal.payload as BillDuePayload;
    const amount = (payload.amountCents / 100).toFixed(2);
    return [
      {
        title: `Pay bill due ${payload.dueDate}`,
        body: `${amount} ${payload.currency}, due in ${payload.daysUntilDue} day${payload.daysUntilDue === 1 ? '' : 's'}.`,
        actionType: ACTION_TYPE,
        params: { billId: payload.billId, dueDate: payload.dueDate, amountCents: payload.amountCents, currency: payload.currency },
        targetKey: `bill:${payload.billId}:reminder`,
        dedupeKey: `${ctx.signal.id}:${ACTION_TYPE}`,
      },
    ];
  }
}

const paramsSchema = z.object({
  billId: z.string().min(1),
  dueDate: z.iso.date(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().min(1),
});
type Params = z.infer<typeof paramsSchema>;

@Injectable()
@ActionHandler(ACTION_TYPE)
export class BillToReminderHandler implements ActionHandler<Params> {
  readonly actionType = ACTION_TYPE;
  readonly targetDomain = 'tasks';
  readonly paramsSchema = paramsSchema;
  readonly supportsRevert = true;

  async apply(ctx: ActionHandlerContext, params: Params): Promise<ApplyResult> {
    const task = await ctx.tx.task.create({
      data: {
        userId: ctx.userId,
        title: `Pay bill due ${params.dueDate}`,
        notes: `${(params.amountCents / 100).toFixed(2)} ${params.currency}`,
        dueAt: new Date(`${params.dueDate}T09:00:00Z`),
        source: ctx.source, // 'suggestion' (manually approved) or 'auto'
      },
    });
    return {
      outcome: 'applied',
      entityRef: { type: 'task', id: task.id },
      before: null,
      after: { taskId: task.id, title: task.title, dueAt: task.dueAt },
      revertData: { taskId: task.id },
    };
  }

  async revert(ctx: ActionHandlerContext, revertData: unknown): Promise<RevertResult> {
    const { taskId } = revertData as { taskId: string };
    const task = await ctx.tx.task.findUnique({ where: { id: taskId } });
    if (!task || task.deletedAt) return { outcome: 'reverted' }; // already gone: nothing to do
    // "Untouched" = never written to since the create() above, which itself sets updatedAt == createdAt.
    if (task.updatedAt.getTime() !== task.createdAt.getTime()) {
      return { outcome: 'conflict', reason: 'The reminder task has since been changed' };
    }
    await ctx.tx.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } });
    return { outcome: 'reverted' };
  }
}
