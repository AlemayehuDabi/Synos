import { SetMetadata } from '@nestjs/common';
import type { ProposalDraft, RuleContext } from './types.js';

export const CONNECTION_RULE_METADATA = 'signal_engine:connection_rule';

export interface ConnectionRule {
  evaluate(ctx: RuleContext): Promise<ProposalDraft[]>;
}

/**
 * Marks a provider as the rule for a connection from the fixed catalog
 * (catalog/connections.ts). Discovered at boot via DiscoveryService - a
 * domain module only has to declare the provider, never touch engine code.
 */
export const ConnectionRule = (connectionId: string): ClassDecorator => SetMetadata(CONNECTION_RULE_METADATA, connectionId);
