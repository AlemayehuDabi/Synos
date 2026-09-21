import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.js';
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
  ) {}

  async processSignal(signalId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const signal = await tx.signal.findUnique({ where: { id: signalId } });
      if (!signal || signal.processedAt) return;

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

          if (mode === 'auto') {
            await this.suggestionsService.applyAuto(tx, suggestion.id);
          } else {
            await this.suggestionsService.logCreated(tx, suggestion);
          }
        }
      }

      await tx.signal.update({ where: { id: signalId }, data: { processedAt: new Date() } });
    });
  }
}
