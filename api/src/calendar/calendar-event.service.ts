import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  compoundCursorWhere,
  type CursorPage,
  decodeCompoundCursor,
  encodeCompoundCursor,
  resolvePageSize,
} from '../common/pagination/cursor-pagination.js';
import { addDaysToDate, isValidCalendarDate, startOfLocalDay } from '../common/time/timezone.js';
import type { CalendarEvent, Prisma } from '../generated/prisma/client.js';
import type { CalendarEventSource } from '../generated/prisma/enums.js';
import { PrismaService } from '../lib/prisma.js';
import { assertEventTiming } from './calendar-range.js';
import { toEventView, toOccurrenceView, type EventView, type OccurrenceView } from './calendar-event.mapper.js';
import type { CreateCalendarEventDto } from './dto/create-event.dto.js';
import type { EditScope } from './dto/update-event.dto.js';
import type { UpdateCalendarEventDto } from './dto/update-event.dto.js';
import {
  assertRRulePossible,
  computeSeriesUntil,
  isNaturalOccurrence,
  naturalOccurrenceEnd,
} from './recurrence/occurrence-expander.js';
import { truncateRRuleBefore } from './recurrence/rrule.js';

interface Timing {
  startsAt: Date;
  endsAt: Date;
}

@Injectable()
export class CalendarEventService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateCalendarEventDto): Promise<EventView> {
    const timezone = await this.resolveTimezone(userId, dto.timezone);
    const allDay = dto.allDay ?? false;
    const { startsAt, endsAt } = this.parseTiming(dto.startsAt, dto.endsAt, allDay);
    assertEventTiming(startsAt, endsAt);

    let seriesUntil: Date | null = null;
    if (dto.rrule) {
      assertRRulePossible(dto.rrule, startsAt, allDay, timezone);
      seriesUntil = computeSeriesUntil(dto.rrule, startsAt, allDay, timezone);
    }

    try {
      const event = await this.prisma.calendarEvent.create({
        data: {
          ...(dto.id ? { id: dto.id } : {}),
          userId,
          title: dto.title,
          notes: dto.notes,
          location: dto.location,
          color: dto.color,
          allDay,
          startsAt,
          endsAt,
          timezone,
          rrule: dto.rrule,
          seriesUntil,
          source: (dto.source ?? 'manual') as CalendarEventSource,
        },
      });
      return toEventView(event);
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException('An event with this id already exists');
      throw error;
    }
  }

  async get(userId: string, id: string): Promise<EventView> {
    return toEventView(await this.findOwned(userId, id));
  }

  /** Master records (not expanded), filterable by from/to overlap using the master's full active span. */
  async list(
    userId: string,
    filters: { from?: string; to?: string },
    pagination: { cursor?: string; limit?: number },
  ): Promise<CursorPage<EventView>> {
    const take = resolvePageSize(pagination.limit);
    const fromInstant = filters.from ? startOfLocalDay(filters.from, 'UTC') : undefined;
    const toInstant = filters.to ? startOfLocalDay(addDaysToDate(filters.to, 1), 'UTC') : undefined;

    const overlap: Prisma.CalendarEventWhereInput[] = [];
    if (fromInstant || toInstant) {
      overlap.push({
        rrule: null,
        ...(fromInstant ? { endsAt: { gt: fromInstant } } : {}),
        ...(toInstant ? { startsAt: { lt: toInstant } } : {}),
      });
      overlap.push({
        rrule: { not: null },
        ...(toInstant ? { startsAt: { lt: toInstant } } : {}),
        ...(fromInstant ? { OR: [{ seriesUntil: null }, { seriesUntil: { gte: fromInstant } }] } : {}),
      });
    }

    const rows = await this.prisma.calendarEvent.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(overlap.length > 0 ? { OR: overlap } : {}),
        ...(pagination.cursor ? compoundCursorWhere('startsAt', decodeCompoundCursor(pagination.cursor), 'asc') : {}),
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: take + 1,
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const last = items.at(-1);
    return {
      items: items.map(toEventView),
      nextCursor: hasMore && last ? encodeCompoundCursor(last.startsAt, last.id) : null,
    };
  }

  async update(userId: string, id: string, dto: UpdateCalendarEventDto): Promise<EventView | OccurrenceView> {
    const event = await this.findOwned(userId, id);
    const scope = dto.scope ?? 'all';

    if (scope !== 'all' && !event.rrule) {
      throw new BadRequestException('scope "this"/"following" only apply to a recurring event');
    }
    const occurrenceStart = this.resolveOccurrenceStart(event, scope, dto.occurrenceStart);

    if (scope === 'this') return this.updateOccurrence(event, occurrenceStart!, dto);
    if (scope === 'following') return this.splitSeries(event, occurrenceStart!, dto);
    return this.updateAll(event, dto);
  }

  async remove(userId: string, id: string, scope: EditScope, occurrenceStartRaw?: string): Promise<void> {
    const event = await this.findOwned(userId, id);
    if (scope !== 'all' && !event.rrule) {
      throw new BadRequestException('scope "this"/"following" only apply to a recurring event');
    }
    const occurrenceStart = this.resolveOccurrenceStart(event, scope, occurrenceStartRaw);

    if (scope === 'this') {
      await this.prisma.calendarEventException.upsert({
        where: { eventId_originalStart: { eventId: event.id, originalStart: occurrenceStart! } },
        create: { eventId: event.id, originalStart: occurrenceStart!, kind: 'cancelled' },
        update: { kind: 'cancelled', title: null, notes: null, location: null, color: null, startsAt: null, endsAt: null },
      });
      return;
    }

    if (scope === 'following') {
      if (occurrenceStart!.getTime() <= event.startsAt.getTime()) {
        await this.prisma.calendarEvent.update({ where: { id: event.id }, data: { deletedAt: new Date() } });
        return;
      }
      await this.prisma.$transaction(async (tx) => {
        const truncatedRRule = truncateRRuleBefore(event.rrule!, occurrenceStart!);
        await tx.calendarEvent.update({
          where: { id: event.id },
          data: { rrule: truncatedRRule, seriesUntil: computeSeriesUntil(truncatedRRule, event.startsAt, event.allDay, event.timezone) },
        });
        await tx.calendarEventException.deleteMany({ where: { eventId: event.id, originalStart: { gte: occurrenceStart! } } });
      });
      return;
    }

    await this.prisma.calendarEvent.update({ where: { id: event.id }, data: { deletedAt: new Date() } });
  }

  // --- scope=this -----------------------------------------------------------------------

  private async updateOccurrence(event: CalendarEvent, occurrenceStart: Date, dto: UpdateCalendarEventDto): Promise<OccurrenceView> {
    if (dto.allDay !== undefined || dto.timezone !== undefined || dto.rrule !== undefined || dto.source !== undefined) {
      throw new BadRequestException('allDay, timezone, rrule and source can only be changed with scope "all" or "following"');
    }
    if ((dto.startsAt === undefined) !== (dto.endsAt === undefined)) {
      throw new BadRequestException('startsAt and endsAt must be given together');
    }
    let timing: Timing | undefined;
    if (dto.startsAt !== undefined && dto.endsAt !== undefined) {
      timing = this.parseTiming(dto.startsAt, dto.endsAt, event.allDay);
      assertEventTiming(timing.startsAt, timing.endsAt);
    }

    const change = {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      ...(dto.location !== undefined ? { location: dto.location } : {}),
      ...(dto.color !== undefined ? { color: dto.color } : {}),
      ...(timing ? { startsAt: timing.startsAt, endsAt: timing.endsAt } : {}),
    };
    const exception = await this.prisma.calendarEventException.upsert({
      where: { eventId_originalStart: { eventId: event.id, originalStart: occurrenceStart } },
      create: { eventId: event.id, originalStart: occurrenceStart, kind: 'modified', ...change },
      update: { kind: 'modified', ...change },
    });
    const naturalEnd = naturalOccurrenceEnd(event, occurrenceStart);
    return toOccurrenceView(
      event.id,
      {
        originalStart: occurrenceStart,
        startsAt: exception.startsAt ?? occurrenceStart,
        endsAt: exception.endsAt ?? naturalEnd,
        title: exception.title ?? event.title,
        notes: exception.notes ?? event.notes,
        location: exception.location ?? event.location,
        color: exception.color ?? event.color,
        modified: true,
      },
      event.allDay,
    );
  }

  // --- scope=all --------------------------------------------------------------------------

  private async updateAll(event: CalendarEvent, dto: UpdateCalendarEventDto): Promise<EventView> {
    const timezone = dto.timezone !== undefined ? await this.resolveTimezone(event.userId, dto.timezone) : event.timezone;
    const allDay = dto.allDay !== undefined ? dto.allDay : event.allDay;
    const rrule = dto.rrule !== undefined ? dto.rrule : event.rrule;

    let timing: Timing = { startsAt: event.startsAt, endsAt: event.endsAt };
    if (dto.startsAt !== undefined || dto.endsAt !== undefined) {
      if ((dto.startsAt === undefined) !== (dto.endsAt === undefined)) {
        throw new BadRequestException('startsAt and endsAt must be given together');
      }
      timing = this.parseTiming(dto.startsAt!, dto.endsAt!, allDay);
    }
    assertEventTiming(timing.startsAt, timing.endsAt);

    let seriesUntil: Date | null = null;
    if (rrule) {
      assertRRulePossible(rrule, timing.startsAt, allDay, timezone);
      seriesUntil = computeSeriesUntil(rrule, timing.startsAt, allDay, timezone);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.calendarEvent.update({
        where: { id: event.id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.location !== undefined ? { location: dto.location } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
          allDay,
          startsAt: timing.startsAt,
          endsAt: timing.endsAt,
          timezone,
          rrule,
          seriesUntil,
          ...(dto.source !== undefined ? { source: dto.source } : {}),
        },
      });
      await this.remapExceptions(tx, row, row);
      return row;
    });
    return toEventView(updated);
  }

  // --- scope=following --------------------------------------------------------------------

  private async splitSeries(event: CalendarEvent, occurrenceStart: Date, dto: UpdateCalendarEventDto): Promise<EventView> {
    if (occurrenceStart.getTime() <= event.startsAt.getTime()) {
      // Nothing precedes the split point: "following" is equivalent to editing the whole series.
      return this.updateAll(event, dto);
    }

    const timezone = dto.timezone !== undefined ? await this.resolveTimezone(event.userId, dto.timezone) : event.timezone;
    const allDay = dto.allDay !== undefined ? dto.allDay : event.allDay;
    const rrule = dto.rrule !== undefined ? dto.rrule : event.rrule;

    let timing: Timing;
    if (dto.startsAt !== undefined || dto.endsAt !== undefined) {
      if ((dto.startsAt === undefined) !== (dto.endsAt === undefined)) {
        throw new BadRequestException('startsAt and endsAt must be given together');
      }
      timing = this.parseTiming(dto.startsAt!, dto.endsAt!, allDay);
    } else {
      const durationMs = event.endsAt.getTime() - event.startsAt.getTime();
      timing = { startsAt: occurrenceStart, endsAt: new Date(occurrenceStart.getTime() + durationMs) };
    }
    assertEventTiming(timing.startsAt, timing.endsAt);

    let seriesUntil: Date | null = null;
    if (rrule) {
      assertRRulePossible(rrule, timing.startsAt, allDay, timezone);
      seriesUntil = computeSeriesUntil(rrule, timing.startsAt, allDay, timezone);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const truncatedRRule = truncateRRuleBefore(event.rrule!, occurrenceStart);
      await tx.calendarEvent.update({
        where: { id: event.id },
        data: {
          rrule: truncatedRRule,
          seriesUntil: computeSeriesUntil(truncatedRRule, event.startsAt, event.allDay, event.timezone),
        },
      });

      const created = await tx.calendarEvent.create({
        data: {
          userId: event.userId,
          title: dto.title !== undefined ? dto.title : event.title,
          notes: dto.notes !== undefined ? dto.notes : event.notes,
          location: dto.location !== undefined ? dto.location : event.location,
          color: dto.color !== undefined ? dto.color : event.color,
          allDay,
          startsAt: timing.startsAt,
          endsAt: timing.endsAt,
          timezone,
          rrule,
          seriesUntil,
          source: dto.source !== undefined ? dto.source : event.source,
        },
      });

      const movable = await tx.calendarEventException.findMany({
        where: { eventId: event.id, originalStart: { gte: occurrenceStart } },
      });
      await this.remapExceptions(tx, created, event, movable);

      return created;
    });
    return toEventView(updated);
  }

  // --- shared helpers ----------------------------------------------------------------------

  /**
   * Moves exceptions onto `target` when its (possibly new) rule still naturally produces
   * their `originalStart`, and drops the rest - the "remap...drop" rule the brief states for
   * scope=all, applied identically when splitting a series for scope=following.
   */
  private async remapExceptions(
    tx: Prisma.TransactionClient,
    target: CalendarEvent,
    source: CalendarEvent,
    explicit?: { id: string; originalStart: Date }[],
  ): Promise<void> {
    const exceptions = explicit ?? (await tx.calendarEventException.findMany({ where: { eventId: source.id } }));
    const toDelete: string[] = [];
    const toMove: string[] = [];
    for (const exception of exceptions) {
      const stillApplies = target.rrule !== null && isNaturalOccurrence(target, exception.originalStart);
      if (stillApplies) toMove.push(exception.id);
      else toDelete.push(exception.id);
    }
    if (toDelete.length > 0) await tx.calendarEventException.deleteMany({ where: { id: { in: toDelete } } });
    if (toMove.length > 0 && target.id !== source.id) {
      await tx.calendarEventException.updateMany({ where: { id: { in: toMove } }, data: { eventId: target.id } });
    }
  }

  private resolveOccurrenceStart(event: CalendarEvent, scope: EditScope, raw: string | undefined): Date | undefined {
    if (scope === 'all') return undefined;
    if (!raw) throw new BadRequestException('occurrenceStart is required for scope "this"/"following"');
    const occurrenceStart = new Date(raw);
    if (Number.isNaN(occurrenceStart.getTime())) throw new BadRequestException('occurrenceStart must be a valid ISO-8601 instant');
    if (!isNaturalOccurrence(event, occurrenceStart)) {
      throw new BadRequestException('occurrenceStart is not an occurrence of this event');
    }
    return occurrenceStart;
  }

  private async findOwned(userId: string, id: string): Promise<CalendarEvent> {
    const event = await this.prisma.calendarEvent.findFirst({ where: { id, userId, deletedAt: null } });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private async resolveTimezone(userId: string, override?: string): Promise<string> {
    if (override) return override;
    const settings = await this.prisma.userSettings.findUnique({ where: { userId }, select: { timezone: true } });
    return settings?.timezone ?? 'UTC';
  }

  private parseTiming(startsAtRaw: string, endsAtRaw: string, allDay: boolean): Timing {
    if (allDay) {
      if (!isValidCalendarDate(startsAtRaw) || !isValidCalendarDate(endsAtRaw)) {
        throw new BadRequestException('startsAt/endsAt must be real calendar dates (YYYY-MM-DD) for an all-day event');
      }
      if (endsAtRaw < startsAtRaw) throw new BadRequestException('endsAt must not be before startsAt');
      return { startsAt: startOfLocalDay(startsAtRaw, 'UTC'), endsAt: startOfLocalDay(addDaysToDate(endsAtRaw, 1), 'UTC') };
    }
    const startsAt = new Date(startsAtRaw);
    const endsAt = new Date(endsAtRaw);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('startsAt/endsAt must be valid ISO-8601 instants');
    }
    return { startsAt, endsAt };
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
  }
}
