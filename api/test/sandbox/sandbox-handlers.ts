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

const paramsSchema = z.object({ billId: z.string().min(1) });
type Params = z.infer<typeof paramsSchema>;

/** Revertible success handler. */
@Injectable()
@ActionHandler(SANDBOX_ACTION_APPLY)
export class SandboxApplyOkHandler implements ActionHandler<Params> {
  readonly actionType = SANDBOX_ACTION_APPLY;
  readonly targetDomain = 'tasks';
  readonly paramsSchema = paramsSchema;
  readonly supportsRevert = true;

  async apply(_ctx: ActionHandlerContext, params: Params): Promise<ApplyResult> {
    return {
      outcome: 'applied',
      entityRef: { type: 'sandbox-task', id: params.billId },
      before: null,
      after: { reminderFor: params.billId },
      revertData: { billId: params.billId },
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
  readonly targetDomain = 'tasks';
  readonly paramsSchema = paramsSchema;
  readonly supportsRevert = false;

  async apply(_ctx: ActionHandlerContext, params: Params): Promise<ApplyResult> {
    return {
      outcome: 'applied',
      entityRef: { type: 'sandbox-task', id: params.billId },
      after: { reminderFor: params.billId },
    };
  }
}

/** Always throws, to exercise the "handler throws" paths. */
@Injectable()
@ActionHandler(SANDBOX_ACTION_THROWS)
export class SandboxThrowsHandler implements ActionHandler<Params> {
  readonly actionType = SANDBOX_ACTION_THROWS;
  readonly targetDomain = 'tasks';
  readonly paramsSchema = paramsSchema;
  readonly supportsRevert = false;

  async apply(): Promise<ApplyResult> {
    throw new Error('sandbox handler intentionally threw');
  }
}

/** Always reports a conflict, to exercise the "handler conflict" paths. */
@Injectable()
@ActionHandler(SANDBOX_ACTION_CONFLICT)
export class SandboxConflictHandler implements ActionHandler<Params> {
  readonly actionType = SANDBOX_ACTION_CONFLICT;
  readonly targetDomain = 'tasks';
  readonly paramsSchema = paramsSchema;
  readonly supportsRevert = false;

  async apply(): Promise<ApplyResult> {
    return { outcome: 'conflict', reason: 'sandbox handler intentionally reported a conflict' };
  }
}
