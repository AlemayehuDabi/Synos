import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../lib/prisma.js';
import { SUGGESTIONS_CREATED_EVENT, type SuggestionsCreatedEvent } from '../events.js';
import { getConnectionsForSignalType } from '../catalog/connections.js';
import type { SignalType } from '../catalog/signals.js';
import { SignalRegistryService } from '../registry/registry.service.js';
import type { RuleSignalView } from '../registry/types.js';
import { ConnectionsService } from '../services/connections.service.js';
import { DEFAULT_SUGGESTION_EXPIRY_DAYS, SuggestionsService } from '../services/suggestions.service.js';

function defaultExpiry(): Date {
  return new Date(Date.now() + DEFAULT_SUGGESTION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * The single place that turns one signal into zero or more suggestions.
 * Shared by the in-process fast path and the sweeper cron so both take the
 * exact same code path; the whole run is one transaction so "mark processedAt
 * only after every connection was handled" is automatic, not something either
 * caller has to remember to do.
 */
@Injectable()
export class SignalProcessorService {
  private readonly logger = new Logger(SignalProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SignalRegistryService,
    private readonly connectionsService: ConnectionsService,
    private readonly suggestionsService: SuggestionsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async processSignal(signalId: string): Promise<void> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const signal = await tx.signal.findUnique({ where: { id: signalId } });
      if (!signal || signal.processedAt) return null;

      const awaitingUser: SuggestionsCreatedEvent['suggestions'] = [];

      const connections = getConnectionsForSignalType(signal.type as SignalType);
      const view: RuleSignalView = {
        id: signal.id,
        type: signal.type,
        payload: signal.payload,
        occurredAt: signal.occurredAt,
        subjectType: signal.subjectType,
        subjectId: signal.subjectId,
      };

      for (const connection of connections) {
        const mode = await this.connectionsService.getEffectiveMode(signal.userId, connection.id, tx);
        if (mode === 'off') continue;

        const rule = this.registry.getRule(connection.id);
        if (!rule) continue; // surfaced via GET /connections' available:false and a boot-time warning

        const drafts = await rule.evaluate({ userId: signal.userId, signal: view, now: new Date() });

        for (const draft of drafts) {
          const handler = this.registry.getHandler(draft.actionType);
          if (!handler) {
            this.logger.warn(
              `Rule "${connection.id}" produced actionType "${draft.actionType}" with no registered handler; skipped`,
            );
            continue;
          }
          const parsedParams = handler.paramsSchema.safeParse(draft.params);
          if (!parsedParams.success) {
            this.logger.warn(`Rule "${connection.id}" produced invalid params for "${draft.actionType}"; skipped`);
            continue;
          }

          await this.suggestionsService.enforcePendingCap(tx, signal.userId, connection.id);

          const { suggestion, created } = await this.suggestionsService.upsertPending(tx, {
            userId: signal.userId,
            signalId: signal.id,
            connectionId: connection.id,
            targetDomain: connection.targetDomain,
            actionType: draft.actionType,
            title: draft.title,
            body: draft.body,
            params: parsedParams.data,
            targetKey: draft.targetKey,
            dedupeKey: draft.dedupeKey,
            expiresAt: draft.expiresAt ?? defaultExpiry(),
          });

          if (!created) continue; // dedupe: another signal already produced this exact suggestion

          let waitingForUser = true;
          if (mode === 'auto') {
            // an auto-applied (or superseded) suggestion is not waiting for anyone
            waitingForUser = (await this.suggestionsService.applyAuto(tx, suggestion.id)) === 'pending';
          } else {
            await this.suggestionsService.logCreated(tx, suggestion);
          }
          if (waitingForUser) {
            awaitingUser.push({
              id: suggestion.id,
              connectionId: suggestion.connectionId,
              targetDomain: suggestion.targetDomain,
              title: suggestion.title,
            });
          }
        }
      }

      await tx.signal.update({ where: { id: signalId }, data: { processedAt: new Date() } });
      return { userId: signal.userId, suggestions: awaitingUser };
    });

    // Only after the commit: a listener must never see a suggestion that could still roll back.
    if (outcome && outcome.suggestions.length > 0) {
      try {
        await this.eventEmitter.emitAsync(SUGGESTIONS_CREATED_EVENT, outcome satisfies SuggestionsCreatedEvent);
      } catch {
        // The signal is already processed; a failing subscriber must not make it look unprocessed.
        this.logger.warn(`A subscriber to ${SUGGESTIONS_CREATED_EVENT} failed for signal ${signalId}`);
      }
    }
  }
}
