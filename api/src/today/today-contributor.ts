import { SetMetadata } from '@nestjs/common';
import { z } from 'zod';
import type { SignalDomain } from '../generated/prisma/enums.js';

export const TODAY_CONTRIBUTOR_METADATA = 'today:contributor';

export interface TodayContext {
  userId: string;
  /** The day being shown, "YYYY-MM-DD", already resolved in the user's timezone. */
  date: string;
  /** The user's IANA timezone. */
  timezone: string;
}

export interface TodayItem {
  id: string;
  title: string;
  /** Anything else the client needs to render the item (time, status, deep link...). */
  [key: string]: unknown;
}

export interface TodayContribution {
  /** A small, domain-defined rollup ({ open: 3, done: 1 }). */
  summary: Record<string, unknown>;
  items: TodayItem[];
}

export interface TodayContributor {
  collect(context: TodayContext): Promise<TodayContribution>;
}

/** What the aggregator requires of whatever a contributor returns. A malformed answer counts as an error. */
export const todayContributionSchema = z.object({
  summary: z.record(z.string(), z.unknown()),
  items: z.array(z.looseObject({ id: z.string(), title: z.string() })),
});

/**
 * Marks a provider as the "Today" contributor for one domain. Discovered at boot
 * via DiscoveryService: a domain module only declares the provider, and never
 * touches this module. At most one contributor per domain.
 */
export const TodayContributor = (domain: SignalDomain): ClassDecorator => SetMetadata(TODAY_CONTRIBUTOR_METADATA, domain);
