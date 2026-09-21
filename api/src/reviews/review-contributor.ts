import { SetMetadata } from '@nestjs/common';
import { z } from 'zod';
import type { ReviewType, SignalDomain } from '../generated/prisma/enums.js';

export const REVIEW_CONTRIBUTOR_METADATA = 'reviews:contributor';

export interface ReviewContext {
  userId: string;
  type: ReviewType;
  /** Start of the period (inclusive) and end (EXCLUSIVE), as instants in the user's timezone: `>= periodStart AND < periodEnd`. */
  periodStart: Date;
  periodEnd: Date;
  /** The same period as local calendar dates, both inclusive, "YYYY-MM-DD". */
  startDate: string;
  endDate: string;
  /** The user's IANA timezone. */
  timezone: string;
}

export type ReviewMetricValue = number | string | boolean | null;

export interface ReviewContribution {
  metrics: Record<string, ReviewMetricValue>;
  highlights: string[];
  /**
   * Say explicitly whether the user did anything in this domain. When omitted, the
   * domain counts as active if it has any highlight or any non-zero numeric metric.
   */
  hasActivity?: boolean;
}

export interface ReviewContributor {
  collect(context: ReviewContext): Promise<ReviewContribution>;
}

export const reviewContributionSchema = z.object({
  metrics: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])),
  highlights: z.array(z.string()),
  hasActivity: z.boolean().optional(),
});

export function contributionHasActivity(contribution: ReviewContribution): boolean {
  if (contribution.hasActivity !== undefined) return contribution.hasActivity;
  return (
    contribution.highlights.length > 0 ||
    Object.values(contribution.metrics).some((value) => typeof value === 'number' && value !== 0)
  );
}

/**
 * Marks a provider as the review contributor for one domain, discovered at boot like
 * @TodayContributor. At most one per domain.
 */
export const ReviewContributor = (domain: SignalDomain): ClassDecorator => SetMetadata(REVIEW_CONTRIBUTOR_METADATA, domain);
