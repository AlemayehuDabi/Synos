export { SignalEngineModule } from './signal-engine.module.js';
export { SignalEngineFacade } from './signal-engine.facade.js';
export type { EmitInput } from './services/signals.service.js';
export type { SignalType } from './catalog/signals.js';
export type { ConnectionId } from './catalog/connections.js';
export {
  ActionHandler,
  ConnectionRule,
  SignalDetector,
  type ActionHandlerContext,
  type ApplyResult,
  type EntityRef,
  type ProposalDraft,
  type RevertResult,
  type RuleContext,
  type SignalDetectorOptions,
} from './registry/index.js';
