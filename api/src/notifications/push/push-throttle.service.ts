import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.js';
import type { NotificationCategory } from '../../generated/prisma/enums.js';

/**
 * "At most one push per interval per (user, category)", enforced in the database so
 * it holds across API instances: a single atomic upsert either records this push
 * (the row was missing, or its last push is older than the interval) or does
 * nothing, and the caller learns which from whether a row came back.
 */
@Injectable()
export class PushThrottleService {
  constructor(private readonly prisma: PrismaService) {}

  /** True if this caller may send a push now (and has reserved the slot); false if one went out too recently. */
  async claim(
    userId: string,
    category: NotificationCategory,
    minIntervalSeconds: number,
    now: Date = new Date(),
  ): Promise<boolean> {
    if (minIntervalSeconds <= 0) return true;
    const cutoff = new Date(now.getTime() - minIntervalSeconds * 1000);
    const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO notification_push_throttles ("userId", "category", "lastPushedAt", "updatedAt")
      VALUES (${userId}::uuid, ${category}::"NotificationCategory", ${now}, ${now})
      ON CONFLICT ("userId", "category")
      DO UPDATE SET "lastPushedAt" = EXCLUDED."lastPushedAt", "updatedAt" = EXCLUDED."updatedAt"
      WHERE notification_push_throttles."lastPushedAt" <= ${cutoff}
      RETURNING "id"
    `;
    return claimed.length > 0;
  }
}
