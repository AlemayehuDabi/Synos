import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { type EmitInput, SignalsService } from './services/signals.service.js';
import { SuggestionsService } from './services/suggestions.service.js';
import type { EntityRef, PrismaTransactionClient } from './registry/types.js';

export const SIGNAL_EMITTED_EVENT = 'signal-engine.signal-emitted';

/**
 * The only thing domain modules should import from the signal engine to emit
 * signals or record manual overrides. Everything else (rules, handlers,
 * detectors) is wired up via the decorator-based registry instead.
 */
@Injectable()
export class SignalEngineFacade {
  constructor(
    private readonly signalsService: SignalsService,
    private readonly suggestionsService: SuggestionsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Persists a signal. When `tx` is given, the row is written inside the
   * caller's own transaction (transactional outbox) and the fast in-process
   * path is skipped; only the sweeper cron will pick it up once the caller's
   * transaction has actually committed, since it only ever reads committed
   * rows. Prisma's interactive transactions have no "after commit" hook to
   * dispatch from reliably, so this is the simplest correct option. Without
   * `tx`, the row commits immediately as its own statement and the fast path
   * fires right away for low-latency processing.
   */
  async emit(input: EmitInput, tx?: PrismaTransactionClient) {
    const signal = await this.signalsService.persist(input, tx);
    if (!tx) {
      this.eventEmitter.emit(SIGNAL_EMITTED_EVENT, { signalId: signal.id });
    }
    return signal;
  }

  async supersedePending(userId: string, targetKey: string, reason: string, by?: EntityRef): Promise<void> {
    return this.suggestionsService.supersedePending(userId, targetKey, reason, by);
  }

  async recordCorrection(
    userId: string,
    input: { targetKey: string; entityRef: EntityRef; before?: unknown; after?: unknown },
  ): Promise<void> {
    return this.suggestionsService.recordCorrection(userId, input);
  }
}
