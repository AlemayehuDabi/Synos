import { BadRequestException } from '@nestjs/common';
import { daysBetweenDates, localDateInTimezone } from '../common/time/timezone.js';

/** GET /calendar/view and /calendar/free-slots reject a wider span than this, per the spec. */
export const CALENDAR_VIEW_MAX_RANGE_DAYS = 62;

/**
 * How far `from`/`to` may sit from today, in either direction, for /calendar/view and
 * /calendar/free-slots. This is not part of the spec; it exists because `rrule-temporal`
 * (the recurrence engine - see occurrence-expander.ts) is measurably safe only when the
 * query target stays close to "now": a query far from it can take seconds, and a few such
 * queries measurably and permanently slow down every later recurrence calculation in the
 * process, including nearby ones. A three-year window is generous for any real calendar
 * use and was verified, under load, to stay in the low-single-digit-millisecond range.
 */
export const CALENDAR_VIEW_HORIZON_DAYS = 1100;

/** A single event or occurrence longer than this is rejected as not sane. */
export const CALENDAR_EVENT_MAX_DURATION_DAYS = 90;

/** How far an event's own startsAt/endsAt may sit from today. Data hygiene, not a performance limit. */
export const CALENDAR_EVENT_HORIZON_YEARS = 100;

/** Validates a `from`/`to` calendar-date range for /calendar/view and /calendar/free-slots. */
export function assertViewRange(from: string, to: string, timezone: string): void {
  const days = daysBetweenDates(from, to);
  if (days < 0) throw new BadRequestException('`to` must not be before `from`');
  if (days >= CALENDAR_VIEW_MAX_RANGE_DAYS) {
    throw new BadRequestException(`The range between \`from\` and \`to\` cannot exceed ${CALENDAR_VIEW_MAX_RANGE_DAYS} days`);
  }

  const today = localDateInTimezone(new Date(), timezone);
  if (daysBetweenDates(today, from) < -CALENDAR_VIEW_HORIZON_DAYS || daysBetweenDates(today, to) > CALENDAR_VIEW_HORIZON_DAYS) {
    throw new BadRequestException(
      `\`from\`/\`to\` cannot be more than ${Math.floor(CALENDAR_VIEW_HORIZON_DAYS / 365)} years from today`,
    );
  }
}

/** Validates the timing of an event or a modified-occurrence override. */
export function assertEventTiming(startsAt: Date, endsAt: Date): void {
  if (!(endsAt > startsAt)) throw new BadRequestException('`endsAt` must be after `startsAt`');

  const durationMs = endsAt.getTime() - startsAt.getTime();
  if (durationMs > CALENDAR_EVENT_MAX_DURATION_DAYS * 86_400_000) {
    throw new BadRequestException(`An event cannot be longer than ${CALENDAR_EVENT_MAX_DURATION_DAYS} days`);
  }

  const horizonMs = CALENDAR_EVENT_HORIZON_YEARS * 365 * 86_400_000;
  const now = Date.now();
  if (Math.abs(startsAt.getTime() - now) > horizonMs || Math.abs(endsAt.getTime() - now) > horizonMs) {
    throw new BadRequestException(`\`startsAt\`/\`endsAt\` cannot be more than ${CALENDAR_EVENT_HORIZON_YEARS} years from today`);
  }
}
