import { SetMetadata } from '@nestjs/common';
import type { z } from 'zod';
import type { ActionHandlerContext, ApplyResult, RevertResult } from './types.js';

export const ACTION_HANDLER_METADATA = 'signal_engine:action_handler';

export interface ActionHandler<P = unknown> {
  readonly actionType: string;
  readonly targetDomain: string;
  readonly paramsSchema: z.ZodType<P>;
  readonly supportsRevert: boolean;
  apply(ctx: ActionHandlerContext, params: P): Promise<ApplyResult>;
  revert?(ctx: ActionHandlerContext, revertData: unknown): Promise<RevertResult>;
}

/**
 * Marks a provider as the handler for `actionType`. The decorator argument
 * must match the instance's own `actionType` property (checked at boot) -
 * both exist so the registry can log/validate without instantiating early.
 */
export const ActionHandler = (actionType: string): ClassDecorator => SetMetadata(ACTION_HANDLER_METADATA, actionType);
