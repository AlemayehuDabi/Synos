import { localMinutesOfDay } from '../common/time/timezone.js';

export interface QuietHours {
  /** "HH:mm", 24-hour, in the user's timezone. Inclusive. */
  start: string;
  /** "HH:mm", 24-hour, in the user's timezone. Exclusive. */
  end: string;
}

export const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "HH:mm" -> minutes since midnight, or NaN when malformed. */
export function parseTimeOfDay(value: string): number {
  if (!TIME_OF_DAY_PATTERN.test(value)) return Number.NaN;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Whether `now` falls inside the user's quiet hours, evaluated on their local clock.
 * The range is [start, end): a push at exactly `end` is allowed. When start > end
 * the range wraps past midnight (22:00-07:00 covers 23:30 and 06:59, not 07:00).
 * No quiet hours, or an empty/invalid range, never suppresses anything.
 */
export function isWithinQuietHours(now: Date, timezone: string, quietHours: QuietHours | null | undefined): boolean {
  if (!quietHours) return false;
  const start = parseTimeOfDay(quietHours.start);
  const end = parseTimeOfDay(quietHours.end);
  if (Number.isNaN(start) || Number.isNaN(end) || start === end) return false;

  const minutes = localMinutesOfDay(now, timezone);
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}
