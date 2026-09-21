import { Injectable } from '@nestjs/common';
import { ConnectionRule, type ProposalDraft, type RuleContext } from '../../src/signal-engine/registry/index.js';
import {
  SANDBOX_ACTION_APPLY,
  SANDBOX_ACTION_CONFLICT,
  SANDBOX_ACTION_NON_REVERTIBLE,
  SANDBOX_ACTION_THROWS,
} from './sandbox-handlers.js';

interface BillDuePayload {
  billId: string;
  dueDate: string;
  amountCents: number;
  currency: string;
  daysUntilDue: number;
}

/**
 * Stands in for the real "bill-to-reminder" rule a future finances/tasks
 * domain would provide. Which fake action type it proposes is picked from a
 * prefix on billId, so e2e tests can drive every handler outcome (success,
 * non-revertible, throw, conflict) through the real "bill.due" signal without
 * needing a fake connection (connections are fixed - see catalog/connections.ts).
 */
@Injectable()
@ConnectionRule('bill-to-reminder')
export class SandboxBillRule implements ConnectionRule {
  async evaluate(ctx: RuleContext): Promise<ProposalDraft[]> {
    const payload = ctx.signal.payload as BillDuePayload;

    // Simulates a rule-level failure (as opposed to a handler-level one), the
    // kind the sweeper's retry/backoff and max-attempts logic exists for.
    if (payload.billId.startsWith('rule-throws-')) {
      throw new Error('sandbox rule intentionally threw');
    }

    const actionType = pickActionType(payload.billId);

    return [
      {
        title: `Reminder: bill ${payload.billId} due ${payload.dueDate}`,
        body: `Sandbox-generated reminder for testing (${payload.amountCents} ${payload.currency}).`,
        actionType,
        params: { billId: payload.billId },
        targetKey: `sandbox:bill:${payload.billId}`,
        dedupeKey: `${ctx.signal.id}:${actionType}`,
      },
    ];
  }
}

function pickActionType(billId: string): string {
  if (billId.startsWith('conflict-')) return SANDBOX_ACTION_CONFLICT;
  if (billId.startsWith('throws-')) return SANDBOX_ACTION_THROWS;
  if (billId.startsWith('norevert-')) return SANDBOX_ACTION_NON_REVERTIBLE;
  return SANDBOX_ACTION_APPLY;
}
