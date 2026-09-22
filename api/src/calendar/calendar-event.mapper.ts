import type { CalendarEvent } from '../generated/prisma/client.js';
import { addDaysToDate, localDateInTimezone } from '../common/time/timezone.js';
import type { Occurrence } from './recurrence/occurrence-expander.js';

export interface EventView {
  id: string;
  title: string;
  notes: string | null;
  location: string | null;
  color: string | null;
  allDay: boolean;
  /** ISO instant for a timed event; "YYYY-MM-DD" (first day, inclusive) for an all-day one. */
  startsAt: string;
  /** ISO instant for a timed event; "YYYY-MM-DD" (last day, inclusive) for an all-day one. */
  endsAt: string;
  timezone: string;
  rrule: string | null;
  seriesUntil: string | null;
  source: CalendarEvent['source'];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Maps a stored row back to what the API returns. All-day events are stored as UTC
 * midnights with an exclusive end (the day after the last day, so duration math is
 * uniform with timed events - see the schema comment); this turns that back into the
 * inclusive "YYYY-MM-DD" pair the client sent.
 */
export function toEventView(event: CalendarEvent): EventView {
  return {
    id: event.id,
    title: event.title,
    notes: event.notes,
    location: event.location,
    color: event.color,
    allDay: event.allDay,
    startsAt: event.allDay ? localDateInTimezone(event.startsAt, 'UTC') : event.startsAt.toISOString(),
    endsAt: event.allDay ? addDaysToDate(localDateInTimezone(event.endsAt, 'UTC'), -1) : event.endsAt.toISOString(),
    timezone: event.timezone,
    rrule: event.rrule,
    seriesUntil: event.seriesUntil ? event.seriesUntil.toISOString() : null,
    source: event.source,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

export interface OccurrenceView {
  eventId: string;
  /** The occurrence's unmodified start - pass this back as `occurrenceStart` to edit or delete it. */
  originalStart: string;
  title: string;
  notes: string | null;
  location: string | null;
  color: string | null;
  allDay: boolean;
  startsAt: string;
  endsAt: string;
  modified: boolean;
}

const formatBoundary = (instant: Date, allDay: boolean, endExclusive: boolean): string => {
  if (!allDay) return instant.toISOString();
  const date = localDateInTimezone(instant, 'UTC');
  return endExclusive ? addDaysToDate(date, -1) : date;
};

export function toOccurrenceView(eventId: string, occurrence: Occurrence, allDay: boolean): OccurrenceView {
  return {
    eventId,
    originalStart: occurrence.originalStart.toISOString(),
    title: occurrence.title,
    notes: occurrence.notes,
    location: occurrence.location,
    color: occurrence.color,
    allDay,
    startsAt: formatBoundary(occurrence.startsAt, allDay, false),
    endsAt: formatBoundary(occurrence.endsAt, allDay, true),
    modified: occurrence.modified,
  };
}
