import type { SignalDomain } from '../generated/prisma/enums.js';

/**
 * Emitted (in-process) after a signal has been processed and its transaction
 * committed, when that processing left suggestions waiting for the user.
 * Other modules subscribe instead of the engine calling into them, so the engine
 * stays free of dependencies on notifications, push, etc.
 */
export const SUGGESTIONS_CREATED_EVENT = 'signal-engine.suggestions-created';

export interface SuggestionsCreatedEvent {
  userId: string;
  suggestions: { id: string; connectionId: string; targetDomain: SignalDomain; title: string }[];
}
