import { Injectable } from '@nestjs/common';
import { ConnectionRule, type ProposalDraft, type RuleContext } from '../../src/signal-engine/registry/index.js';
import {
  SANDBOX_ACTION_APPLY,
  SANDBOX_ACTION_CONFLICT,
  SANDBOX_ACTION_NON_REVERTIBLE,
  SANDBOX_ACTION_THROWS,
} from './sandbox-handlers.js';

interface GroceryCostPayload {
  groceryListId: string;
  estimatedCostCents: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
}

/**
 * Stands in for the real "grocery-cost-to-budget" rule a future meals/finances
 * domain would provide. Which fake action type it proposes is picked from a
 * prefix on groceryListId, so e2e tests can drive every handler outcome (success,
 * non-revertible, throw, conflict) through the real "grocery.cost" signal
 * without needing a fake connection (connections are fixed - see
 * catalog/connections.ts). Was "workout-to-habit" until the Habits module
 * supplied a real rule for that connection; moved here, since both neither-
 * side-yet-built connections (this one and "budget-overrun-to-cheaper-meals")
 * are now the only ones fully unclaimed.
 */
@Injectable()
@ConnectionRule('grocery-cost-to-budget')
export class SandboxGroceryRule implements ConnectionRule {
  async evaluate(ctx: RuleContext): Promise<ProposalDraft[]> {
    const payload = ctx.signal.payload as GroceryCostPayload;

    // Simulates a rule-level failure (as opposed to a handler-level one), the
    // kind the sweeper's retry/backoff and max-attempts logic exists for.
    if (payload.groceryListId.startsWith('rule-throws-')) {
      throw new Error('sandbox rule intentionally threw');
    }

    const actionType = pickActionType(payload.groceryListId);

    return [
      {
        title: `Log habit for grocery list ${payload.groceryListId}`,
        body: `Sandbox-generated reminder for testing (${(payload.estimatedCostCents / 100).toFixed(2)} ${payload.currency}).`,
        actionType,
        params: { groceryListId: payload.groceryListId },
        targetKey: `sandbox:grocery:${payload.groceryListId}`,
        dedupeKey: `${ctx.signal.id}:${actionType}`,
      },
    ];
  }
}

function pickActionType(groceryListId: string): string {
  if (groceryListId.startsWith('conflict-')) return SANDBOX_ACTION_CONFLICT;
  if (groceryListId.startsWith('throws-')) return SANDBOX_ACTION_THROWS;
  if (groceryListId.startsWith('norevert-')) return SANDBOX_ACTION_NON_REVERTIBLE;
  return SANDBOX_ACTION_APPLY;
}
