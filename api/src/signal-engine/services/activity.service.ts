import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { ActivityKind, SignalDomain } from '../../generated/prisma/enums.js';
import {
  compoundCursorWhere,
  type CursorPage,
  decodeCompoundCursor,
  encodeCompoundCursor,
  resolvePageSize,
} from '../../common/pagination/cursor-pagination.js';
import type { PrismaTransactionClient } from '../registry/types.js';

export interface LogActivityInput {
  userId: string;
  kind: ActivityKind;
  suggestionId?: string;
  signalId?: string;
  connectionId?: string;
  targetDomain?: SignalDomain;
  entityRef?: unknown;
  before?: unknown;
  after?: unknown;
}

export interface ListActivityFilters {
  kind?: ActivityKind;
  domain?: SignalDomain;
  connectionId?: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: LogActivityInput, tx?: PrismaTransactionClient) {
    const client = tx ?? this.prisma;
    return client.activityLog.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        suggestionId: input.suggestionId,
        signalId: input.signalId,
        connectionId: input.connectionId,
        targetDomain: input.targetDomain,
        entityRef: input.entityRef as Prisma.InputJsonValue,
        before: input.before as Prisma.InputJsonValue,
        after: input.after as Prisma.InputJsonValue,
      },
    });
  }

  async list(
    userId: string,
    filters: ListActivityFilters,
    pagination: { cursor?: string; limit?: number },
  ): Promise<CursorPage<unknown>> {
    const take = resolvePageSize(pagination.limit);
    const where = {
      userId,
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.domain ? { targetDomain: filters.domain } : {}),
      ...(filters.connectionId ? { connectionId: filters.connectionId } : {}),
      ...(filters.from || filters.to
        ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
      ...(pagination.cursor ? compoundCursorWhere('createdAt', decodeCompoundCursor(pagination.cursor)) : {}),
    };

    const rows = await this.prisma.activityLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const last = items.at(-1);

    return {
      items,
      nextCursor: hasMore && last ? encodeCompoundCursor(last.createdAt, last.id) : null,
    };
  }
}
