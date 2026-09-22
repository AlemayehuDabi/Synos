import { SetMetadata } from '@nestjs/common';
import { z } from 'zod';
import type { SignalDomain } from '../generated/prisma/enums.js';

export const CALENDAR_BLOCK_CONTRIBUTOR_METADATA = 'calendar:block-contributor';

export interface CalendarBlockContext {
  userId: string;
  /** Inclusive lower bound. */
  from: Date;
  /** Exclusive upper bound. */
  to: Date;
  /** The user's IANA timezone. */
  timezone: string;
}

export interface Block {
  id: string;
  domain: SignalDomain;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  /** Whether this block occupies time for free/busy purposes (GET /calendar/free-slots). */
  busy: boolean;
  /** Anything else the client needs to deep-link into the owning domain. */
  ref?: unknown;
}

export interface CalendarBlockContributor {
  collect(context: CalendarBlockContext): Promise<Block[]>;
}

/** What the view aggregator requires of whatever a contributor returns. A malformed answer counts as an error. */
export const blockSchema = z.object({
  id: z.string(),
  domain: z.string(),
  title: z.string(),
  startsAt: z.union([z.date(), z.iso.datetime({ offset: true })]),
  endsAt: z.union([z.date(), z.iso.datetime({ offset: true })]),
  allDay: z.boolean(),
  busy: z.boolean(),
  ref: z.unknown().optional(),
});

/**
 * Marks a provider as the read-only soft-block contributor for one domain, discovered at
 * boot the same way @TodayContributor and @ReviewContributor are. Calendar never writes
 * into another domain's data, and no domain writes into Calendar; this is the one-way,
 * read-only bridge domains use to show up on GET /calendar/view and free-slots
 * computations. At most one contributor per domain.
 */
export const CalendarBlockContributor = (domain: SignalDomain): ClassDecorator =>
  SetMetadata(CALENDAR_BLOCK_CONTRIBUTOR_METADATA, domain);
