import { Injectable, NotFoundException } from '@nestjs/common';
import {
  compoundCursorWhere,
  type CursorPage,
  decodeCompoundCursor,
  encodeCompoundCursor,
  resolvePageSize,
} from '../common/pagination/cursor-pagination.js';
import type { ReviewType } from '../generated/prisma/enums.js';
import type { Review } from '../generated/prisma/client.js';
import { PrismaService } from '../lib/prisma.js';
import type { ReviewSection } from './cross-domain-section.js';

export interface ReviewView {
  id: string;
  type: ReviewType;
  /** Inclusive local calendar dates, "YYYY-MM-DD". */
  periodStart: string;
  periodEnd: string;
  timezone: string;
  sections: ReviewSection[];
  generatedAt: Date;
}

const toView = (review: Review): ReviewView => ({
  id: review.id,
  type: review.type,
  periodStart: review.periodStart.toISOString().slice(0, 10),
  periodEnd: review.periodEnd.toISOString().slice(0, 10),
  timezone: review.timezone,
  sections: review.sections as unknown as ReviewSection[],
  generatedAt: review.generatedAt,
});

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Newest period first. Ties (a week and a month starting the same day) break on id, so pages never skip or repeat. */
  async list(
    userId: string,
    filters: { type?: ReviewType },
    pagination: { cursor?: string; limit?: number },
  ): Promise<CursorPage<ReviewView>> {
    const take = resolvePageSize(pagination.limit);
    const rows = await this.prisma.review.findMany({
      where: {
        userId,
        ...(filters.type ? { type: filters.type } : {}),
        ...(pagination.cursor ? compoundCursorWhere('periodStart', decodeCompoundCursor(pagination.cursor)) : {}),
      },
      orderBy: [{ periodStart: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const last = items.at(-1);
    return {
      items: items.map(toView),
      nextCursor: hasMore && last ? encodeCompoundCursor(last.periodStart, last.id) : null,
    };
  }

  async get(userId: string, id: string): Promise<ReviewView> {
    const review = await this.prisma.review.findFirst({ where: { id, userId } });
    if (!review) throw new NotFoundException('Review not found');
    return toView(review);
  }
}
