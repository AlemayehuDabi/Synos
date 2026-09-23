import { BadRequestException } from '@nestjs/common';
import { RRuleTemporal } from 'rrule-temporal';
import { Temporal } from 'temporal-polyfill';
import type { CalendarEvent, CalendarEventException } from '../../generated/prisma/client.js';
import { buildIcsString, MAX_RRULE_UNTIL_YEARS_AHEAD, type ParsedRRule, parseRRule } from './rrule.js';

/**
 * `rrule-temporal`'s `between()`/`previous()`/`next()` are safe and fast when the
 * requested instant is close to the rule's own DTSTART (verified empirically:
 * single-digit milliseconds regardless of how far DTSTART itself sits from the
 * present). They are NOT safe when asked for a target far from DTSTART: cost
 * grows from tens of milliseconds into multiple seconds as the target gets more
 * distant, and - worse - a handful of such far queries measurably and
 * permanently slow down *every later call in the same process*, including
 * otherwise-nearby ones (reproduced consistently: two far queries followed by a
 * near one went from ~2ms to ~11s). A long-lived server must never let a client
 * construct such a query. Two rules follow from this and are enforced at the
 * call sites below and in the view/free-slots services:
 *   1. Query windows (`between`) are only ever used within CALENDAR view/free-slots
 *      routes, which restrict `from`/`to` to a bounded horizon around "now"
 *      (see calendar-range.ts) - never with an arbitrary, client-chosen target.
 *   2. Every other use of the engine (possibility checks, seriesUntil) either
 *      searches at-or-near DTSTART (`next`, cheap and safe regardless of how far
 *      DTSTART itself is from now) or walks a COUNT-bounded `all()`, whose cost is
 *      proportional to COUNT, not to calendar distance, and is unaffected by the
 *      slow-query pathology above (also verified empirically, including after
 *      deliberately triggering the pathology first).
 * `maxIterations` below is deliberately small: it protects against a rule that
 * can never produce an occurrence (e.g. Feb 30 every year), which throws almost
 * immediately once iteration is capped - it does not, and cannot, bound the
 * far-query cost described above, which is a per-step cost, not a step count.
 */
const POSSIBILITY_CHECK_MAX_ITERATIONS = 500;
/** A little above MAX_RRULE_COUNT so a fully-packed series never spuriously hits the cap. */
export const SERIES_UNTIL_MAX_ITERATIONS = 2000;

export interface Occurrence {
  /** The occurrence's natural start, before any exception override - the key CalendarEventException rows use. */
  originalStart: Date;
  startsAt: Date;
  endsAt: Date;
  title: string;
  notes: string | null;
  location: string | null;
  color: string | null;
  /** True when a `modified` exception changed this occurrence from the series default. */
  modified: boolean;
}

function icsTimezoneFor(event: Pick<CalendarEvent, 'allDay' | 'timezone'>): string {
  // All-day series are calendar-date arithmetic, deliberately immune to DST: see
  // the schema comment on CalendarEvent. `timezone` is stored only as metadata.
  return event.allDay ? 'UTC' : event.timezone;
}

/**
 * Builds a safety-vetted RRuleTemporal for a `{allDay, timezone, startsAt, rrule}`-shaped
 * anchor - exported so other domains that reuse this recurrence engine (see Tasks) build
 * their RRuleTemporal instances the exact same way, with the exact same `maxIterations`
 * guards, rather than reimplementing the far-query safety analysis above.
 */
export function buildRule(event: Pick<CalendarEvent, 'allDay' | 'timezone' | 'startsAt' | 'rrule'>, maxIterations: number): RRuleTemporal {
  if (!event.rrule) throw new Error('buildRule requires a recurring event');
  const parsed = parseRRule(event.rrule);
  const tzid = icsTimezoneFor(event);
  return new RRuleTemporal({ rruleString: buildIcsString(parsed, event.startsAt, tzid), maxIterations });
}

/**
 * Throws a 400 if the rule, combined with this DTSTART, could never actually occur (e.g.
 * Feb 30 yearly), or if UNTIL sits unreasonably far after DTSTART (data hygiene, not a
 * performance limit - see computeSeriesUntil).
 */
export function assertRRulePossible(rrule: string, startsAt: Date, allDay: boolean, timezone: string): void {
  const parsed = parseRRule(rrule);
  if (parsed.until) {
    const maxUntilMs = startsAt.getTime() + MAX_RRULE_UNTIL_YEARS_AHEAD * 365 * 86_400_000;
    if (parsed.until.getTime() > maxUntilMs) {
      throw new BadRequestException(`UNTIL cannot be more than ${MAX_RRULE_UNTIL_YEARS_AHEAD} years after startsAt`);
    }
  }
  const tzid = allDay ? 'UTC' : timezone;
  let rule: RRuleTemporal;
  try {
    rule = new RRuleTemporal({ rruleString: buildIcsString(parsed, startsAt, tzid), maxIterations: POSSIBILITY_CHECK_MAX_ITERATIONS });
    // Searches at DTSTART itself - always the cheap, safe case regardless of how far DTSTART is from "now".
    const first = rule.next(startsAt, true);
    if (!first) throw new Error('no occurrence');
  } catch {
    throw new BadRequestException('This recurrence rule can never produce an occurrence');
  }
}

/**
 * The instant after which the series produces no further occurrences, or `null`
 * for an open-ended series. UNTIL-bound rules use UNTIL directly (no engine call:
 * UNTIL is always a safe upper bound even if the pattern's true last occurrence
 * falls a little earlier). COUNT-bound rules use a COUNT-bounded `all()` walk
 * (cheap and safe; see the module comment). Both are computed once, at write time.
 */
export function computeSeriesUntil(rrule: string, startsAt: Date, allDay: boolean, timezone: string): Date | null {
  const parsed = parseRRule(rrule);
  if (parsed.until) return parsed.until;
  if (parsed.count === undefined) return null;

  const tzid = allDay ? 'UTC' : timezone;
  const rule = new RRuleTemporal({ rruleString: buildIcsString(parsed, startsAt, tzid), maxIterations: SERIES_UNTIL_MAX_ITERATIONS });
  const occurrences = rule.all();
  const last = occurrences.at(-1);
  if (!last) throw new BadRequestException('This recurrence rule can never produce an occurrence');
  return new Date(last.epochMilliseconds);
}

/**
 * Wall-clock duration from `start` to `end` in `timezone`, DST-aware: whole days are kept as
 * calendar days (so a multi-day event re-applied to another date lands on the same wall-clock
 * time regardless of any DST change in between), and the remainder as exact elapsed time.
 * Without `largestUnit: 'day'`, `until()` returns a pure hour count, which would silently bake
 * in whatever DST shift happened to apply on the *original* occurrence.
 */
function wallClockDuration(start: Date, end: Date, timezone: string): Temporal.Duration {
  const zonedStart = Temporal.Instant.from(start.toISOString()).toZonedDateTimeISO(timezone);
  const zonedEnd = Temporal.Instant.from(end.toISOString()).toZonedDateTimeISO(timezone);
  return zonedStart.until(zonedEnd, { largestUnit: 'day' });
}

/**
 * The end of the occurrence naturally starting at `occurrenceStart` (assumed already
 * validated, e.g. via `isNaturalOccurrence`), preserving the master's wall-clock duration.
 * Deliberately does not call into the recurrence engine at all, so a write that touches one
 * occurrence is never subject to the far-query cost described in the module comment above,
 * however far into a long-running series that occurrence happens to be.
 */
export function naturalOccurrenceEnd(event: Pick<CalendarEvent, 'allDay' | 'timezone' | 'startsAt' | 'endsAt'>, occurrenceStart: Date): Date {
  const duration = wallClockDuration(event.startsAt, event.endsAt, icsTimezoneFor(event));
  const zonedOccurrenceStart = Temporal.Instant.from(occurrenceStart.toISOString()).toZonedDateTimeISO(icsTimezoneFor(event));
  return new Date(zonedOccurrenceStart.add(duration).epochMilliseconds);
}

export interface ExpandOptions {
  /** Inclusive lower bound. Must already be within the caller's enforced horizon - see the module comment. */
  from: Date;
  /** Exclusive upper bound. */
  to: Date;
  /** How many more occurrences this call is allowed to produce; decremented as it goes. */
  budget: { remaining: number };
}

/**
 * All occurrences of one event (recurring or not) that overlap `[from, to)`, with
 * exceptions applied. Never throws for a tombstoned event; the caller filters
 * those out beforehand (deletedAt is not checked here).
 */
export function expandEvent(
  event: CalendarEvent,
  exceptions: CalendarEventException[],
  options: ExpandOptions,
): Occurrence[] {
  const duration = wallClockDuration(event.startsAt, event.endsAt, icsTimezoneFor(event));
  const ownExceptions = exceptions.filter((exception) => exception.eventId === event.id);
  const byOriginalStart = new Map(ownExceptions.map((exception) => [exception.originalStart.getTime(), exception]));

  const apply = (originalStart: Date, naturalStart: Date, naturalEnd: Date): Occurrence | null => {
    const exception = byOriginalStart.get(originalStart.getTime());
    if (exception?.kind === 'cancelled') return null;
    if (exception?.kind === 'modified') {
      return {
        originalStart,
        startsAt: exception.startsAt ?? naturalStart,
        endsAt: exception.endsAt ?? naturalEnd,
        title: exception.title ?? event.title,
        notes: exception.notes ?? event.notes,
        location: exception.location ?? event.location,
        color: exception.color ?? event.color,
        modified: true,
      };
    }
    return {
      originalStart,
      startsAt: naturalStart,
      endsAt: naturalEnd,
      title: event.title,
      notes: event.notes,
      location: event.location,
      color: event.color,
      modified: false,
    };
  };

  if (!event.rrule) {
    if (event.endsAt <= options.from || event.startsAt >= options.to) return [];
    if (options.budget.remaining < 1) {
      throw new BadRequestException('Too many occurrences match this query; narrow the date range');
    }
    options.budget.remaining -= 1;
    const occurrence = apply(event.startsAt, event.startsAt, event.endsAt);
    return occurrence ? [occurrence] : [];
  }

  const rule = buildRule(event, SERIES_UNTIL_MAX_ITERATIONS);
  // Widen the search slightly before `from`: an occurrence that starts before the window
  // can still overlap it if it runs long, so it needs to be found by its *natural*
  // (unmodified) start too. The raw millisecond gap is only a rough backward bound here
  // (a real search widening amount, not a result), so DST-precise wall-clock math is not
  // needed for it - the per-occurrence end below is what must be exact.
  const rawDurationMs = event.endsAt.getTime() - event.startsAt.getTime();
  const searchFrom = new Date(options.from.getTime() - rawDurationMs - 1);
  const candidates = rule.between(searchFrom < event.startsAt ? event.startsAt : searchFrom, options.to, true);

  const occurrences: Occurrence[] = [];
  const seen = new Set<number>();
  const emit = (naturalStart: Date, naturalEnd: Date): void => {
    if (seen.has(naturalStart.getTime())) return;
    seen.add(naturalStart.getTime());
    const occurrence = apply(naturalStart, naturalStart, naturalEnd);
    if (!occurrence) return;
    if (occurrence.endsAt <= options.from || occurrence.startsAt >= options.to) return;
    if (options.budget.remaining < 1) {
      throw new BadRequestException('Too many occurrences match this query; narrow the date range');
    }
    options.budget.remaining -= 1;
    occurrences.push(occurrence);
  };

  for (const candidate of candidates) {
    const naturalStart = new Date(candidate.epochMilliseconds);
    const naturalEnd = new Date(naturalStart.getTime() + Number(duration.total({ unit: 'milliseconds', relativeTo: candidate })));
    emit(naturalStart, naturalEnd);
  }

  // A `modified` exception can move or lengthen an occurrence enough that its *natural*
  // start falls outside the widened search above (e.g. moved much later, or made far
  // longer than the master's own duration) while its *overridden* time still overlaps the
  // window. Each such exception's own originalStart is checked directly against the rule.
  for (const exception of ownExceptions) {
    if (exception.kind !== 'modified' || seen.has(exception.originalStart.getTime())) continue;
    if (!isNaturalOccurrence(event, exception.originalStart)) continue; // stale: no longer produced by the (possibly since-edited) rule
    emit(exception.originalStart, naturalOccurrenceEnd(event, exception.originalStart));
  }

  return occurrences;
}

/**
 * Whether `occurrenceStart` is (still) a natural occurrence of this event's rule - used to
 * validate a client-supplied `occurrenceStart` and to decide, when a series is edited or
 * truncated, which of its exceptions still apply (`matches()` is safe regardless of how far
 * `occurrenceStart` sits from DTSTART or "now" - see the module comment).
 */
export function isNaturalOccurrence(
  event: Pick<CalendarEvent, 'allDay' | 'timezone' | 'startsAt' | 'rrule'>,
  occurrenceStart: Date,
): boolean {
  if (!event.rrule) return event.startsAt.getTime() === occurrenceStart.getTime();
  return buildRule(event, SERIES_UNTIL_MAX_ITERATIONS).matches(occurrenceStart);
}

export type { ParsedRRule };
