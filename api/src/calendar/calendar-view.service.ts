import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { addDaysToDate, startOfLocalDay } from '../common/time/timezone.js';
import type { SignalDomain } from '../generated/prisma/enums.js';
import { PrismaService } from '../lib/prisma.js';
import { CalendarBlockAggregatorService } from './calendar-block-aggregator.service.js';
import type { Block } from './calendar-block-contributor.js';
import { toOccurrenceView, type OccurrenceView } from './calendar-event.mapper.js';
import { fetchOverlappingEvents, expandUserOccurrences } from './calendar-occurrences.js';
import { assertViewRange } from './calendar-range.js';

export type ViewItem =
  | ({ kind: 'event' } & OccurrenceView)
  | ({ kind: 'block' } & Omit<Block, 'startsAt' | 'endsAt'> & { startsAt: string; endsAt: string });

export interface ContributorStatus {
  domain: SignalDomain;
  status: 'ok' | 'error' | 'timeout';
}

export interface CalendarViewResult {
  from: string;
  to: string;
  timezone: string;
  items: ViewItem[];
  contributors: ContributorStatus[];
}

@Injectable()
export class CalendarViewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregator: CalendarBlockAggregatorService,
    private readonly config: ConfigService,
  ) {}

  async view(userId: string, from: string, to: string, timezoneOverride?: string): Promise<CalendarViewResult> {
    const timezone = timezoneOverride ?? (await this.resolveTimezone(userId));
    assertViewRange(from, to, timezone);
    const fromInstant = startOfLocalDay(from, timezone);
    const toInstant = startOfLocalDay(addDaysToDate(to, 1), timezone);
    const budget = { remaining: this.config.get<number>('CALENDAR_MAX_OCCURRENCES_PER_QUERY', 2000) };

    const [{ events, exceptionsByEvent }, blockResult] = await Promise.all([
      fetchOverlappingEvents(this.prisma, userId, fromInstant, toInstant),
      this.aggregator.collect({ userId, from: fromInstant, to: toInstant, timezone }),
    ]);

    const eventItems: ViewItem[] = expandUserOccurrences(events, exceptionsByEvent, fromInstant, toInstant, budget).map(
      ({ event, occurrence }) => ({ kind: 'event', ...toOccurrenceView(event.id, occurrence, event.allDay) }),
    );

    const contributors: ContributorStatus[] = [];
    const blockItems: ViewItem[] = [];
    for (const section of blockResult) {
      contributors.push({ domain: section.domain, status: section.status });
      if (section.status !== 'ok') continue;
      for (const block of section.blocks) {
        if (budget.remaining < 1) throw new BadRequestException('Too many occurrences match this query; narrow the date range');
        budget.remaining -= 1;
        blockItems.push({ kind: 'block', ...block, startsAt: block.startsAt.toISOString(), endsAt: block.endsAt.toISOString() });
      }
    }

    const items = [...eventItems, ...blockItems].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    return { from, to, timezone, items, contributors };
  }

  private async resolveTimezone(userId: string): Promise<string> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId }, select: { timezone: true } });
    return settings?.timezone ?? 'UTC';
  }
}
