import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../lib/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import type { NotificationCategory, SignalDomain } from '../generated/prisma/enums.js';
import {
  compoundCursorWhere,
  type CursorPage,
  decodeCompoundCursor,
  encodeCompoundCursor,
  resolvePageSize,
} from '../common/pagination/cursor-pagination.js';

export interface StoreNotificationInput {
  userId: string;
  category: NotificationCategory;
  domain?: SignalDomain;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  dedupeKey?: string;
}

const PUBLIC_FIELDS = {
  id: true,
  category: true,
  domain: true,
  title: true,
  body: true,
  data: true,
  readAt: true,
  createdAt: true,
} as const;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Stores an in-app notification. Idempotent on (userId, dedupeKey): a repeat
   * returns the existing row with `created: false`, so callers know not to push again.
   */
  async store(input: StoreNotificationInput) {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId: input.userId,
          category: input.category,
          domain: input.domain,
          title: input.title,
          body: input.body,
          data: (input.data ?? {}) as Prisma.InputJsonValue,
          dedupeKey: input.dedupeKey,
        },
      });
      return { notification, created: true };
    } catch (error) {
      if (input.dedupeKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const notification = await this.prisma.notification.findFirstOrThrow({
          where: { userId: input.userId, dedupeKey: input.dedupeKey },
        });
        return { notification, created: false };
      }
      throw error;
    }
  }

  async list(
    userId: string,
    filters: { unreadOnly?: boolean },
    pagination: { cursor?: string; limit?: number },
  ): Promise<CursorPage<unknown>> {
    const take = resolvePageSize(pagination.limit);
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(filters.unreadOnly ? { readAt: null } : {}),
        ...(pagination.cursor ? compoundCursorWhere('createdAt', decodeCompoundCursor(pagination.cursor)) : {}),
      },
      select: PUBLIC_FIELDS,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const last = items.at(-1);
    return { items, nextCursor: hasMore && last ? encodeCompoundCursor(last.createdAt, last.id) : null };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** Idempotent: reading an already-read notification keeps its original readAt. */
  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    const notification = await this.prisma.notification.findFirst({ where: { id, userId }, select: PUBLIC_FIELDS });
    if (!notification) throw new NotFoundException('Notification not found');
    return notification;
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  /** Retention: read notifications whose readAt is before the cutoff. Unread ones are never pruned. */
  async pruneRead(readBefore: Date): Promise<number> {
    const result = await this.prisma.notification.deleteMany({ where: { readAt: { not: null, lt: readBefore } } });
    return result.count;
  }
}
