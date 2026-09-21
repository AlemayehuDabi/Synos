import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { SignalDomain } from '../../generated/prisma/enums.js';
import {
  compoundCursorWhere,
  type CursorPage,
  decodeCompoundCursor,
  encodeCompoundCursor,
  resolvePageSize,
} from '../../common/pagination/cursor-pagination.js';
import { getSignalCatalogEntry, isKnownSignalType } from '../catalog/signals.js';
import type { EntityRef, PrismaTransactionClient } from '../registry/types.js';

export interface EmitInput {
  userId: string;
  type: string;
  payload: unknown;
  occurredAt?: Date;
  subject?: EntityRef;
  dedupeKey?: string;
}

export interface ListSignalsFilters {
  domain?: SignalDomain;
  type?: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class SignalsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates and persists a signal. When a dedupeKey collides with an
   * existing signal for this user, returns the existing row instead of
   * throwing - emitting the same underlying event twice (e.g. after a
   * caller-side retry) is a no-op, not an error.
   */
  async persist(input: EmitInput, tx?: PrismaTransactionClient) {
    if (!isKnownSignalType(input.type)) {
      throw new BadRequestException(`Unknown signal type "${input.type}"`);
    }
    const entry = getSignalCatalogEntry(input.type);
    const parsed = entry.payloadSchema.safeParse(input.payload);
    if (!parsed.success) {
      throw new BadRequestException(`Invalid payload for signal "${input.type}": ${parsed.error.message}`);
    }

    const client = tx ?? this.prisma;
    try {
      return await client.signal.create({
        data: {
          userId: input.userId,
          type: input.type,
          sourceDomain: entry.sourceDomain,
          schemaVersion: entry.schemaVersion,
          payload: parsed.data as Prisma.InputJsonValue,
          subjectType: input.subject?.type,
          subjectId: input.subject?.id,
          dedupeKey: input.dedupeKey,
          occurredAt: input.occurredAt ?? new Date(),
        },
      });
    } catch (error) {
      if (
        input.dedupeKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return client.signal.findFirstOrThrow({
          where: { userId: input.userId, dedupeKey: input.dedupeKey },
        });
      }
      throw error;
    }
  }

  async list(
    userId: string,
    filters: ListSignalsFilters,
    pagination: { cursor?: string; limit?: number },
  ): Promise<CursorPage<unknown>> {
    const take = resolvePageSize(pagination.limit);
    const where = {
      userId,
      ...(filters.domain ? { sourceDomain: filters.domain } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.from || filters.to
        ? { occurredAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
      ...(pagination.cursor ? compoundCursorWhere('occurredAt', decodeCompoundCursor(pagination.cursor)) : {}),
    };

    const rows = await this.prisma.signal.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const last = items.at(-1);

    return {
      items,
      nextCursor: hasMore && last ? encodeCompoundCursor(last.occurredAt, last.id) : null,
    };
  }
}
