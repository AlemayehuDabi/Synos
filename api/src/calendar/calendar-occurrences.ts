import type { CalendarEvent, CalendarEventException, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../lib/prisma.js';
import { expandEvent, type Occurrence } from './recurrence/occurrence-expander.js';

/**
 * Every one of a user's non-deleted events whose *active span* overlaps `[from, to)` - a
 * recurring event's span runs from its own startsAt to its seriesUntil (or forever, if
 * open-ended), not just its first occurrence - plus their exceptions, grouped by event.
 * Shared by GET /calendar/view, GET /calendar/free-slots and the Today/Review contributors
 * so all four agree on exactly what "overlaps this range" means.
 */
export async function fetchOverlappingEvents(
  prisma: PrismaService,
  userId: string,
  from: Date,
  to: Date,
): Promise<{ events: CalendarEvent[]; exceptionsByEvent: Map<string, CalendarEventException[]> }> {
  const where: Prisma.CalendarEventWhereInput = {
    userId,
    deletedAt: null,
    OR: [
      { rrule: null, endsAt: { gt: from }, startsAt: { lt: to } },
      { rrule: { not: null }, startsAt: { lt: to }, OR: [{ seriesUntil: null }, { seriesUntil: { gte: from } }] },
    ],
  };
  const events = await prisma.calendarEvent.findMany({ where });
  const recurringIds = events.filter((event) => event.rrule).map((event) => event.id);
  const exceptions = recurringIds.length ? await prisma.calendarEventException.findMany({ where: { eventId: { in: recurringIds } } }) : [];

  const exceptionsByEvent = new Map<string, CalendarEventException[]>();
  for (const exception of exceptions) {
    const list = exceptionsByEvent.get(exception.eventId) ?? [];
    list.push(exception);
    exceptionsByEvent.set(exception.eventId, list);
  }
  return { events, exceptionsByEvent };
}

/** Expands every given event's occurrences overlapping `[from, to)`, sharing one occurrence-count budget across all of them. */
export function expandUserOccurrences(
  events: CalendarEvent[],
  exceptionsByEvent: Map<string, CalendarEventException[]>,
  from: Date,
  to: Date,
  budget: { remaining: number },
): { event: CalendarEvent; occurrence: Occurrence }[] {
  const results: { event: CalendarEvent; occurrence: Occurrence }[] = [];
  for (const event of events) {
    for (const occurrence of expandEvent(event, exceptionsByEvent.get(event.id) ?? [], { from, to, budget })) {
      results.push({ event, occurrence });
    }
  }
  return results;
}
