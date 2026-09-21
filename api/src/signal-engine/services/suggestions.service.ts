import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../lib/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { SignalDomain, SuggestionStatus } from '../../generated/prisma/enums.js';
import {
  compoundCursorWhere,
  type CursorPage,
  decodeCompoundCursor,
  encodeCompoundCursor,
  resolvePageSize,
} from '../../common/pagination/cursor-pagination.js';
import { SignalRegistryService } from '../registry/registry.service.js';
import type { ApplyResult, EntityRef, PrismaTransactionClient } from '../registry/types.js';
import { ActivityService } from './activity.service.js';

export const DEFAULT_SUGGESTION_EXPIRY_DAYS = 7;

export interface UpsertPendingInput {
  userId: string;
  signalId?: string;
  connectionId: string;
  targetDomain: SignalDomain;
  actionType: string;
  title: string;
  body: string;
  params: unknown;
  targetKey: string;
  dedupeKey: string;
  expiresAt: Date;
}

export interface ListInboxFilters {
  status?: SuggestionStatus;
  domain?: SignalDomain;
  connectionId?: string;
}

/** Where an auto-mode suggestion ended up: `pending` means it downgraded to waiting for the user. */
export type AutoApplyOutcome = 'applied' | 'superseded' | 'pending';

type ApproveOutcome =
  | { kind: 'applied' }
  | { kind: 'conflict'; reason: string }
  | { kind: 'cas-lost' };

@Injectable()
export class SuggestionsService {
  private readonly logger = new Logger(SuggestionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
    private readonly registry: SignalRegistryService,
    private readonly configService: ConfigService,
  ) {}

  /** Idempotent on (userId, connectionId, dedupeKey): reprocessing never duplicates. */
  async upsertPending(
    tx: PrismaTransactionClient,
    input: UpsertPendingInput,
  ): Promise<{ suggestion: Prisma.SuggestionGetPayload<object>; created: boolean }> {
    try {
      const suggestion = await tx.suggestion.create({
        data: {
          userId: input.userId,
          signalId: input.signalId,
          connectionId: input.connectionId,
          targetDomain: input.targetDomain,
          actionType: input.actionType,
          title: input.title,
          body: input.body,
          params: input.params as Prisma.InputJsonValue,
          targetKey: input.targetKey,
          dedupeKey: input.dedupeKey,
          expiresAt: input.expiresAt,
          status: 'pending',
        },
      });
      return { suggestion, created: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const suggestion = await tx.suggestion.findFirstOrThrow({
          where: { userId: input.userId, connectionId: input.connectionId, dedupeKey: input.dedupeKey },
        });
        return { suggestion, created: false };
      }
      throw error;
    }
  }

  /** Drops the oldest pending suggestions for a connection down to `maxPending - 1`, making room for one more. */
  async enforcePendingCap(tx: PrismaTransactionClient, userId: string, connectionId: string): Promise<void> {
    const maxPending = this.configService.get<number>('MAX_PENDING_PER_CONNECTION', 20);
    const count = await tx.suggestion.count({ where: { userId, connectionId, status: 'pending' } });
    if (count < maxPending) return;

    const overflow = await tx.suggestion.findMany({
      where: { userId, connectionId, status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: count - maxPending + 1,
      select: { id: true },
    });
    if (overflow.length === 0) return;

    // Only log the rows this statement actually moved: a concurrent approve may have won some.
    const expired = await tx.suggestion.updateManyAndReturn({
      where: { id: { in: overflow.map((s) => s.id) }, status: 'pending' },
      data: { status: 'expired', resolvedAt: new Date(), resolvedBy: 'system' },
      select: { id: true },
    });
    for (const s of expired) {
      await this.activityService.log({ userId, kind: 'expired', suggestionId: s.id, connectionId }, tx);
    }
  }

  /**
   * Runs a handler inside a SAVEPOINT so whatever it wrote through `tx` is
   * discarded unless it reports `applied`. Without this, a handler that wrote
   * something and then threw (or returned conflict/noop) would leave those
   * writes in the surrounding transaction, and a failed statement inside the
   * handler would leave that whole transaction in Postgres's aborted state.
   */
  private async applyWithSavepoint(
    tx: PrismaTransactionClient,
    call: () => Promise<ApplyResult>,
  ): Promise<ApplyResult> {
    await tx.$executeRawUnsafe('SAVEPOINT handler_apply');
    try {
      const result = await call();
      await tx.$executeRawUnsafe(
        result.outcome === 'applied' ? 'RELEASE SAVEPOINT handler_apply' : 'ROLLBACK TO SAVEPOINT handler_apply',
      );
      return result;
    } catch (error) {
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT handler_apply');
      throw error;
    }
  }

  /**
   * Applies an auto-mode connection's freshly created pending suggestion inside
   * the caller's transaction. Never throws for handler failures: a thrown error
   * or a `noop` result both downgrade to a plain pending suggestion with a
   * failureNote, matching suggest-mode - only unexpected infra errors escape.
   */
  async applyAuto(tx: PrismaTransactionClient, suggestionId: string): Promise<AutoApplyOutcome> {
    const suggestion = await tx.suggestion.findUniqueOrThrow({ where: { id: suggestionId } });
    const handler = this.registry.getHandler(suggestion.actionType);
    if (!handler) {
      // Should not happen: the caller already checked a handler exists before creating
      // the suggestion. Leave it pending rather than lose the suggestion.
      return 'pending';
    }

    let result: ApplyResult;
    try {
      result = await this.applyWithSavepoint(tx, () =>
        handler.apply({ userId: suggestion.userId, tx, source: 'auto', suggestionId }, suggestion.params),
      );
    } catch (error) {
      result = { outcome: 'noop', reason: error instanceof Error ? error.message : String(error) };
    }

    if (result.outcome === 'applied') {
      await tx.suggestion.update({
        where: { id: suggestionId },
        data: {
          status: 'auto_applied',
          resolvedAt: new Date(),
          resolvedBy: 'system',
          revertData: (result.revertData ?? null) as Prisma.InputJsonValue,
        },
      });
      await this.activityService.log(
        {
          userId: suggestion.userId,
          kind: 'auto_applied',
          suggestionId,
          signalId: suggestion.signalId ?? undefined,
          connectionId: suggestion.connectionId,
          targetDomain: suggestion.targetDomain,
          entityRef: result.entityRef,
          before: result.before,
          after: result.after,
        },
        tx,
      );
      return 'applied';
    }

    if (result.outcome === 'conflict') {
      await tx.suggestion.update({
        where: { id: suggestionId },
        data: { status: 'superseded', supersededReason: result.reason, resolvedAt: new Date(), resolvedBy: 'system' },
      });
      await this.activityService.log(
        {
          userId: suggestion.userId,
          kind: 'superseded',
          suggestionId,
          signalId: suggestion.signalId ?? undefined,
          connectionId: suggestion.connectionId,
          targetDomain: suggestion.targetDomain,
        },
        tx,
      );
      return 'superseded';
    }

    // Graceful downgrade to suggest-first: stays pending, note why auto-apply didn't happen.
    await tx.suggestion.update({ where: { id: suggestionId }, data: { failureNote: result.reason } });
    await this.activityService.log(
      {
        userId: suggestion.userId,
        kind: 'suggestion_created',
        suggestionId,
        signalId: suggestion.signalId ?? undefined,
        connectionId: suggestion.connectionId,
        targetDomain: suggestion.targetDomain,
      },
      tx,
    );
    return 'pending';
  }

  async logCreated(tx: PrismaTransactionClient, suggestion: Prisma.SuggestionGetPayload<object>): Promise<void> {
    await this.activityService.log(
      {
        userId: suggestion.userId,
        kind: 'suggestion_created',
        suggestionId: suggestion.id,
        signalId: suggestion.signalId ?? undefined,
        connectionId: suggestion.connectionId,
        targetDomain: suggestion.targetDomain,
      },
      tx,
    );
  }

  async getInboxItem(userId: string, id: string) {
    const suggestion = await this.prisma.suggestion.findFirst({
      where: { id, userId },
      include: { signal: true },
    });
    if (!suggestion) throw new NotFoundException('Suggestion not found');

    const activity = await this.prisma.activityLog.findMany({
      where: { suggestionId: id },
      orderBy: { createdAt: 'asc' },
    });

    const { signal, ...rest } = suggestion;
    return {
      ...rest,
      trigger: signal
        ? { signalId: signal.id, type: signal.type, occurredAt: signal.occurredAt, payload: signal.payload }
        : null,
      statusHistory: activity,
    };
  }

  async listInbox(
    userId: string,
    filters: ListInboxFilters,
    pagination: { cursor?: string; limit?: number },
  ): Promise<CursorPage<unknown>> {
    const take = resolvePageSize(pagination.limit);
    const where = {
      userId,
      status: filters.status ?? 'pending',
      ...(filters.domain ? { targetDomain: filters.domain } : {}),
      ...(filters.connectionId ? { connectionId: filters.connectionId } : {}),
      ...(pagination.cursor ? compoundCursorWhere('createdAt', decodeCompoundCursor(pagination.cursor)) : {}),
    };

    const rows = await this.prisma.suggestion.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const last = items.at(-1);

    return { items, nextCursor: hasMore && last ? encodeCompoundCursor(last.createdAt, last.id) : null };
  }

  async countPending(userId: string): Promise<number> {
    return this.prisma.suggestion.count({ where: { userId, status: 'pending' } });
  }

  async edit(userId: string, id: string, params: unknown) {
    const suggestion = await this.prisma.suggestion.findFirst({ where: { id, userId } });
    if (!suggestion) throw new NotFoundException('Suggestion not found');
    if (suggestion.status !== 'pending') throw new ConflictException('Suggestion is not pending');

    const handler = this.registry.getHandler(suggestion.actionType);
    if (!handler) throw new UnprocessableEntityException(`No handler registered for "${suggestion.actionType}"`);

    const parsed = handler.paramsSchema.safeParse(params);
    if (!parsed.success) {
      throw new UnprocessableEntityException({ message: 'Invalid params', details: parsed.error.issues });
    }

    const updated = await this.prisma.suggestion.updateMany({
      where: { id, userId, status: 'pending' },
      data: {
        params: parsed.data as Prisma.InputJsonValue,
        originalParams: (suggestion.originalParams ?? (suggestion.params as Prisma.InputJsonValue)) as Prisma.InputJsonValue,
      },
    });
    if (updated.count === 0) throw new ConflictException('Suggestion is no longer pending');
    await this.activityService.log({
      userId,
      kind: 'suggestion_edited',
      suggestionId: id,
      connectionId: suggestion.connectionId,
      targetDomain: suggestion.targetDomain,
      before: suggestion.params,
      after: parsed.data,
    });

    return this.getInboxItem(userId, id);
  }

  /** Optionally edits params in the same call, then approves. */
  async approve(userId: string, id: string, editedParams?: unknown) {
    const existing = await this.prisma.suggestion.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Suggestion not found');
    if (existing.status !== 'pending') throw new ConflictException('Suggestion is not pending');

    const handler = this.registry.getHandler(existing.actionType);
    if (!handler) throw new UnprocessableEntityException(`No handler registered for "${existing.actionType}"`);

    const candidateParams = editedParams === undefined ? existing.params : editedParams;
    const parsedParams = handler.paramsSchema.safeParse(candidateParams);
    if (!parsedParams.success) {
      throw new UnprocessableEntityException({ message: 'Invalid params', details: parsedParams.error.issues });
    }

    let outcome: ApproveOutcome;
    try {
      outcome = await this.prisma.$transaction(async (tx) => {
        const claim = await tx.suggestion.updateMany({
          where: { id, userId, status: 'pending' },
          data: {
            status: 'approved',
            resolvedAt: new Date(),
            resolvedBy: 'user',
            params: parsedParams.data as Prisma.InputJsonValue,
            ...(editedParams !== undefined
              ? { originalParams: (existing.originalParams ?? (existing.params as Prisma.InputJsonValue)) as Prisma.InputJsonValue }
              : {}),
          },
        });
        if (claim.count === 0) return { kind: 'cas-lost' } as const;

        const result = await this.applyWithSavepoint(tx, () =>
          handler.apply({ userId, tx, source: 'suggestion', suggestionId: id }, parsedParams.data),
        );

        if (result.outcome === 'conflict' || result.outcome === 'noop') {
          await tx.suggestion.update({
            where: { id },
            data: { status: 'superseded', supersededReason: result.reason, resolvedAt: new Date(), resolvedBy: 'system' },
          });
          await this.activityService.log(
            {
              userId,
              kind: 'superseded',
              suggestionId: id,
              connectionId: existing.connectionId,
              targetDomain: existing.targetDomain,
            },
            tx,
          );
          return { kind: 'conflict', reason: result.reason } as const;
        }

        await tx.suggestion.update({
          where: { id },
          data: { revertData: (result.revertData ?? null) as Prisma.InputJsonValue },
        });
        if (editedParams !== undefined) {
          await this.activityService.log(
            {
              userId,
              kind: 'suggestion_edited',
              suggestionId: id,
              connectionId: existing.connectionId,
              targetDomain: existing.targetDomain,
              before: existing.params,
              after: parsedParams.data,
            },
            tx,
          );
        }
        await this.activityService.log(
          {
            userId,
            kind: 'suggestion_approved',
            suggestionId: id,
            connectionId: existing.connectionId,
            targetDomain: existing.targetDomain,
            entityRef: result.entityRef,
            before: result.before,
            after: result.after,
          },
          tx,
        );
        return { kind: 'applied' } as const;
      });
    } catch (error) {
      // Transaction rolled back (including the CAS claim): record the failure separately.
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.suggestion.updateMany({
        where: { id, userId, status: 'pending' },
        data: { status: 'failed', failureNote: message, resolvedAt: new Date(), resolvedBy: 'system' },
      });
      throw new UnprocessableEntityException(`Handler failed: ${message}`);
    }

    if (outcome.kind === 'cas-lost') throw new ConflictException('Suggestion is no longer pending');
    if (outcome.kind === 'conflict') throw new ConflictException(outcome.reason);

    return this.getInboxItem(userId, id);
  }

  async dismiss(userId: string, id: string, reason?: string) {
    const result = await this.prisma.suggestion.updateMany({
      where: { id, userId, status: 'pending' },
      data: { status: 'dismissed', resolvedAt: new Date(), resolvedBy: 'user' },
    });
    if (result.count === 0) {
      const exists = await this.prisma.suggestion.findFirst({ where: { id, userId } });
      if (!exists) throw new NotFoundException('Suggestion not found');
      throw new ConflictException('Suggestion is no longer pending');
    }

    const suggestion = await this.prisma.suggestion.findUniqueOrThrow({ where: { id } });
    await this.activityService.log({
      userId,
      kind: 'suggestion_dismissed',
      suggestionId: id,
      connectionId: suggestion.connectionId,
      targetDomain: suggestion.targetDomain,
      // supersededReason is reserved for the system-superseded case; a manual
      // dismiss reason (free text, optional) is recorded on the activity entry instead.
      after: reason ? { reason } : undefined,
    });

    return this.getInboxItem(userId, id);
  }

  async bulk(userId: string, action: 'approve' | 'dismiss', ids: string[]) {
    const results: { id: string; status: 'ok' | 'error'; error?: string }[] = [];
    for (const id of ids) {
      try {
        if (action === 'approve') {
          await this.approve(userId, id);
        } else {
          await this.dismiss(userId, id);
        }
        results.push({ id, status: 'ok' });
      } catch (error) {
        results.push({ id, status: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  }

  /** Marks matching pending suggestions superseded because a manual write took precedence. */
  async supersedePending(userId: string, targetKey: string, reason: string, by?: EntityRef): Promise<void> {
    // One atomic compare-and-set that returns exactly the rows it moved, so the
    // audit log never records a supersede for a suggestion someone approved first.
    const superseded = await this.prisma.suggestion.updateManyAndReturn({
      where: { userId, targetKey, status: 'pending' },
      data: { status: 'superseded', supersededReason: reason, resolvedAt: new Date(), resolvedBy: 'system' },
      select: { id: true, connectionId: true, targetDomain: true },
    });
    for (const s of superseded) {
      await this.activityService.log({
        userId,
        kind: 'superseded',
        suggestionId: s.id,
        connectionId: s.connectionId,
        targetDomain: s.targetDomain,
        entityRef: by,
      });
    }
  }

  async recordCorrection(
    userId: string,
    input: { targetKey: string; entityRef: EntityRef; before?: unknown; after?: unknown },
  ): Promise<void> {
    const relatedSuggestion = await this.prisma.suggestion.findFirst({
      where: { userId, targetKey: input.targetKey, status: { in: ['auto_applied', 'approved'] } },
      orderBy: { resolvedAt: 'desc' },
    });

    await this.activityService.log({
      userId,
      kind: 'manual_override',
      suggestionId: relatedSuggestion?.id,
      connectionId: relatedSuggestion?.connectionId,
      targetDomain: relatedSuggestion?.targetDomain,
      entityRef: input.entityRef,
      before: input.before,
      after: input.after,
    });
  }

  async expirePending(): Promise<number> {
    const expired = await this.prisma.suggestion.updateManyAndReturn({
      where: { status: 'pending', expiresAt: { lt: new Date() } },
      data: { status: 'expired', resolvedAt: new Date(), resolvedBy: 'system' },
      select: { id: true, userId: true, connectionId: true, targetDomain: true },
    });
    for (const s of expired) {
      await this.activityService.log({
        userId: s.userId,
        kind: 'expired',
        suggestionId: s.id,
        connectionId: s.connectionId,
        targetDomain: s.targetDomain,
      });
    }
    return expired.length;
  }

  async undoActivity(userId: string, activityId: string) {
    const activity = await this.prisma.activityLog.findFirst({ where: { id: activityId, userId } });
    if (!activity) throw new NotFoundException('Activity entry not found');
    if (!activity.suggestionId || (activity.kind !== 'suggestion_approved' && activity.kind !== 'auto_applied')) {
      throw new UnprocessableEntityException('Only an approval or auto-apply entry can be undone');
    }
    if (activity.undoneAt) throw new ConflictException('This action was already undone');

    const suggestion = await this.prisma.suggestion.findFirst({ where: { id: activity.suggestionId, userId } });
    if (!suggestion) throw new NotFoundException('Suggestion not found');
    if (suggestion.status !== 'approved' && suggestion.status !== 'auto_applied') {
      throw new UnprocessableEntityException('Only approved or auto-applied suggestions can be undone');
    }

    const handler = this.registry.getHandler(suggestion.actionType);
    if (!handler || !handler.supportsRevert || !handler.revert) {
      throw new UnprocessableEntityException('This action does not support undo');
    }

    const undoWindowDays = this.configService.get<number>('UNDO_WINDOW_DAYS', 30);
    const windowMs = undoWindowDays * 24 * 60 * 60 * 1000;
    if (Date.now() - activity.createdAt.getTime() > windowMs) {
      throw new UnprocessableEntityException('The undo window for this action has passed');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // Compare-and-set both the suggestion and the activity entry *before*
        // touching the domain: of two concurrent undo calls exactly one gets past
        // these claims, so handler.revert can never run twice for the same action.
        const claimedSuggestion = await tx.suggestion.updateMany({
          where: { id: suggestion.id, userId, status: { in: ['approved', 'auto_applied'] } },
          data: { status: 'reverted' },
        });
        const claimedActivity = await tx.activityLog.updateMany({
          where: { id: activityId, userId, undoneAt: null },
          data: { undoneAt: new Date() },
        });
        if (claimedSuggestion.count === 0 || claimedActivity.count === 0) {
          throw new ConflictExceptionMarker('This action was already undone');
        }

        const result = await handler.revert!(
          { userId, tx, source: 'suggestion', suggestionId: suggestion.id },
          suggestion.revertData,
        );
        if (result.outcome === 'conflict') {
          // Rolls the claims above back too, so a conflicted undo leaves everything untouched.
          throw new ConflictExceptionMarker(result.reason);
        }

        await this.activityService.log(
          {
            userId,
            kind: 'reverted',
            suggestionId: suggestion.id,
            connectionId: suggestion.connectionId,
            targetDomain: suggestion.targetDomain,
          },
          tx,
        );
      });
    } catch (error) {
      if (error instanceof ConflictExceptionMarker) {
        throw new ConflictException(error.message);
      }
      throw error;
    }

    return this.getInboxItem(userId, suggestion.id);
  }
}

/** Internal-only: lets undoActivity distinguish a handler-reported conflict from a real failure inside $transaction. */
class ConflictExceptionMarker extends Error {}
