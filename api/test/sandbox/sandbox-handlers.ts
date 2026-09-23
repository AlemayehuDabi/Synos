import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  ActionHandler,
  type ActionHandlerContext,
  type ApplyResult,
  type RevertResult,
} from '../../src/signal-engine/registry/index.js';

export const SANDBOX_ACTION_APPLY = 'sandbox.apply-ok';
export const SANDBOX_ACTION_NON_REVERTIBLE = 'sandbox.apply-non-revertible';
export const SANDBOX_ACTION_THROWS = 'sandbox.apply-throws';
export const SANDBOX_ACTION_CONFLICT = 'sandbox.apply-conflict';

const paramsSchema = z.object({ workoutId: z.string().min(1) });
type Params = z.infer<typeof paramsSchema>;

/**
 * Writes a marker row through the engine-provided transaction. The failing
 * handlers below call this *before* failing, so tests can prove the engine
 * discards a handler's partial writes rather than just that it caught the error.
 */
export const PARTIAL_WRITE_KIND = 'manual_override' as const;
async function writePartialWrite(ctx: ActionHandlerContext): Promise<void> {
  await ctx.tx.activityLog.create({
    data: { userId: ctx.userId, kind: PARTIAL_WRITE_KIND, entityRef: { partialWriteBy: ctx.suggestionId } },
  });
}

/** Revertible success handler. */
@Injectable()
@ActionHandler(SANDBOX_ACTION_APPLY)
export class SandboxApplyOkHandler implements ActionHandler<Params> {
  readonly actionType = SANDBOX_ACTION_APPLY;
  readonly targetDomain = 'habits';
  readonly paramsSchema = paramsSchema;
  readonly supportsRevert = true;

  async apply(_ctx: ActionHandlerContext, params: Params): Promise<ApplyResult> {
    return {
      outcome: 'applied',
      entityRef: { type: 'sandbox-task', id: params.workoutId },
      before: null,
      after: { reminderFor: params.workoutId },
      revertData: { workoutId: params.workoutId },
    };
  }

  async revert(_ctx: ActionHandlerContext, _revertData: unknown): Promise<RevertResult> {
    return { outcome: 'reverted' };
  }
}

/** Success handler that does not support revert. */
@Injectable()
@ActionHandler(SANDBOX_ACTION_NON_REVERTIBLE)
export class SandboxNonRevertibleHandler implements ActionHandler<Params> {
  readonly actionType = SANDBOX_ACTION_NON_REVERTIBLE;
  readonly targetDomain = 'habits';
  readonly paramsSchema = paramsSchema;
  readonly supportsRevert = false;

  async apply(_ctx: ActionHandlerContext, params: Params): Promise<ApplyResult> {
    return {
      outcome: 'applied',
      entityRef: { type: 'sandbox-task', id: params.workoutId },
      after: { reminderFor: params.workoutId },
    };
  }
}

/** Always throws, to exercise the "handler throws" paths. */
@Injectable()
@ActionHandler(SANDBOX_ACTION_THROWS)
export class SandboxThrowsHandler implements ActionHandler<Params> {
  readonly actionType = SANDBOX_ACTION_THROWS;
  readonly targetDomain = 'habits';
  readonly paramsSchema = paramsSchema;
  readonly supportsRevert = false;

  async apply(ctx: ActionHandlerContext): Promise<ApplyResult> {
    await writePartialWrite(ctx);
    throw new Error('sandbox handler intentionally threw');
  }
}

/** Always reports a conflict, to exercise the "handler conflict" paths. */
@Injectable()
@ActionHandler(SANDBOX_ACTION_CONFLICT)
export class SandboxConflictHandler implements ActionHandler<Params> {
  readonly actionType = SANDBOX_ACTION_CONFLICT;
  readonly targetDomain = 'habits';
  readonly paramsSchema = paramsSchema;
  readonly supportsRevert = false;

  async apply(ctx: ActionHandlerContext): Promise<ApplyResult> {
    await writePartialWrite(ctx);
    return { outcome: 'conflict', reason: 'sandbox handler intentionally reported a conflict' };
  }
}
