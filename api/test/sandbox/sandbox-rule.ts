import { Injectable } from '@nestjs/common';
import { ConnectionRule, type ProposalDraft, type RuleContext } from '../../src/signal-engine/registry/index.js';
import {
  SANDBOX_ACTION_APPLY,
  SANDBOX_ACTION_CONFLICT,
  SANDBOX_ACTION_NON_REVERTIBLE,
  SANDBOX_ACTION_THROWS,
} from './sandbox-handlers.js';

interface WorkoutCompletedPayload {
  workoutId: string;
  completedAt: string;
  durationMinutes: number;
  workoutType: string;
}

/**
 * Stands in for the real "workout-to-habit" rule a future fitness/habits
 * domain would provide. Which fake action type it proposes is picked from a
 * prefix on workoutId, so e2e tests can drive every handler outcome (success,
 * non-revertible, throw, conflict) through the real "workout.completed" signal
 * without needing a fake connection (connections are fixed - see
 * catalog/connections.ts). Was "bill-to-reminder" until the Tasks module
 * supplied a real rule for that connection; moved here, the one connection
 * still fully unimplemented (fitness and habits do not exist yet either).
 */
@Injectable()
@ConnectionRule('workout-to-habit')
export class SandboxWorkoutRule implements ConnectionRule {
  async evaluate(ctx: RuleContext): Promise<ProposalDraft[]> {
    const payload = ctx.signal.payload as WorkoutCompletedPayload;

    // Simulates a rule-level failure (as opposed to a handler-level one), the
    // kind the sweeper's retry/backoff and max-attempts logic exists for.
    if (payload.workoutId.startsWith('rule-throws-')) {
      throw new Error('sandbox rule intentionally threw');
    }

    const actionType = pickActionType(payload.workoutId);

    return [
      {
        title: `Log habit for workout ${payload.workoutId}`,
        body: `Sandbox-generated reminder for testing (${payload.durationMinutes} min ${payload.workoutType}).`,
        actionType,
        params: { workoutId: payload.workoutId },
        targetKey: `sandbox:workout:${payload.workoutId}`,
        dedupeKey: `${ctx.signal.id}:${actionType}`,
      },
    ];
  }
}

function pickActionType(workoutId: string): string {
  if (workoutId.startsWith('conflict-')) return SANDBOX_ACTION_CONFLICT;
  if (workoutId.startsWith('throws-')) return SANDBOX_ACTION_THROWS;
  if (workoutId.startsWith('norevert-')) return SANDBOX_ACTION_NON_REVERTIBLE;
  return SANDBOX_ACTION_APPLY;
}
