import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolvePageSize } from '../common/pagination/cursor-pagination.js';
import { addDaysToDate, instantAtLocalTimeOfDay, startOfLocalDay } from '../common/time/timezone.js';
import { PrismaService } from '../lib/prisma.js';
import { CalendarBlockAggregatorService } from './calendar-block-aggregator.service.js';
import { fetchOverlappingEvents, expandUserOccurrences } from './calendar-occurrences.js';
import { assertViewRange } from './calendar-range.js';

export interface FreeSlot {
  startsAt: string;
  endsAt: string;
}

interface Interval {
  start: number;
  end: number;
}

@Injectable()
export class CalendarFreeSlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregator: CalendarBlockAggregatorService,
    private readonly config: ConfigService,
  ) {}

  async freeSlots(
    userId: string,
    from: string,
    to: string,
    durationMinutes: number,
    options: { dayStart?: string; dayEnd?: string; timezone?: string; limit?: number },
  ): Promise<FreeSlot[]> {
    const timezone = options.timezone ?? (await this.resolveTimezone(userId));
    assertViewRange(from, to, timezone);
    if ((options.dayStart === undefined) !== (options.dayEnd === undefined)) {
      throw new BadRequestException('dayStart and dayEnd must be given together');
    }
    if (options.dayStart && options.dayStart >= options.dayEnd!) {
      throw new BadRequestException('dayStart must be before dayEnd');
    }

    const fromInstant = startOfLocalDay(from, timezone);
    const toInstant = startOfLocalDay(addDaysToDate(to, 1), timezone);
    const durationMs = durationMinutes * 60_000;
    const budget = { remaining: this.config.get<number>('CALENDAR_MAX_OCCURRENCES_PER_QUERY', 2000) };

    const [busy, blockResult] = await Promise.all([
      this.collectBusyEventIntervals(userId, fromInstant, toInstant, budget),
      this.aggregator.collect({ userId, from: fromInstant, to: toInstant, timezone }),
    ]);
    for (const section of blockResult) {
      if (section.status !== 'ok') continue;
      for (const block of section.blocks) {
        if (!block.busy) continue;
        if (budget.remaining < 1) throw new BadRequestException('Too many occurrences match this query; narrow the date range');
        budget.remaining -= 1;
        busy.push({ start: block.startsAt.getTime(), end: block.endsAt.getTime() });
      }
    }

    const windows = this.dailyWindows(from, to, fromInstant, toInstant, timezone, options.dayStart, options.dayEnd);
    const mergedBusy = this.mergeIntervals(busy);
    const limit = resolvePageSize(options.limit);

    const slots: FreeSlot[] = [];
    for (const window of windows) {
      for (const gap of this.subtract(window, mergedBusy)) {
        if (gap.end - gap.start < durationMs) continue;
        slots.push({ startsAt: new Date(gap.start).toISOString(), endsAt: new Date(gap.end).toISOString() });
        if (slots.length >= limit) return slots;
      }
    }
    return slots;
  }

  /** Every calendar event is inherently busy time - unlike a soft Block, it carries no `busy` flag of its own. */
  private async collectBusyEventIntervals(userId: string, from: Date, to: Date, budget: { remaining: number }): Promise<Interval[]> {
    const { events, exceptionsByEvent } = await fetchOverlappingEvents(this.prisma, userId, from, to);
    return expandUserOccurrences(events, exceptionsByEvent, from, to, budget).map(({ occurrence }) => ({
      start: occurrence.startsAt.getTime(),
      end: occurrence.endsAt.getTime(),
    }));
  }

  /** One window per day when working hours are given (clipped to `[from,to)`); a single `[from,to)` window otherwise. */
  private dailyWindows(from: string, to: string, fromInstant: Date, toInstant: Date, timezone: string, dayStart?: string, dayEnd?: string): Interval[] {
    if (!dayStart || !dayEnd) return [{ start: fromInstant.getTime(), end: toInstant.getTime() }];

    const windows: Interval[] = [];
    for (let day = from; day <= to; day = addDaysToDate(day, 1)) {
      const start = Math.max(instantAtLocalTimeOfDay(day, dayStart, timezone).getTime(), fromInstant.getTime());
      const end = Math.min(instantAtLocalTimeOfDay(day, dayEnd, timezone).getTime(), toInstant.getTime());
      if (end > start) windows.push({ start, end });
    }
    return windows;
  }

  private mergeIntervals(intervals: Interval[]): Interval[] {
    if (intervals.length === 0) return [];
    const sorted = [...intervals].sort((a, b) => a.start - b.start);
    const merged: Interval[] = [{ ...sorted[0] }];
    for (const interval of sorted.slice(1)) {
      const last = merged.at(-1)!;
      if (interval.start <= last.end) last.end = Math.max(last.end, interval.end);
      else merged.push({ ...interval });
    }
    return merged;
  }

  /** The parts of `window` not covered by any (already merged, sorted) interval in `busy`. */
  private subtract(window: Interval, busy: Interval[]): Interval[] {
    const gaps: Interval[] = [];
    let cursor = window.start;
    for (const interval of busy) {
      if (interval.end <= window.start || interval.start >= window.end) continue;
      if (interval.start > cursor) gaps.push({ start: cursor, end: Math.min(interval.start, window.end) });
      cursor = Math.max(cursor, interval.end);
      if (cursor >= window.end) break;
    }
    if (cursor < window.end) gaps.push({ start: cursor, end: window.end });
    return gaps;
  }

  private async resolveTimezone(userId: string): Promise<string> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId }, select: { timezone: true } });
    return settings?.timezone ?? 'UTC';
  }
}
