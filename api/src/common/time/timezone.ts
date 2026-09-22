/**
 * Timezone and calendar helpers built on Intl (the same source UserSettings
 * validates timezones against), so no date library is needed. Calendar dates are
 * "YYYY-MM-DD" strings; instants are Dates.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timezone, formatter);
  }
  return formatter;
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The wall-clock reading in `timezone` at the given instant. */
export function localParts(instant: Date, timezone: string): LocalParts {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timezone).formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

/** The calendar date ("YYYY-MM-DD") it is in `timezone` at the given instant. */
export function localDateInTimezone(instant: Date, timezone: string): string {
  const { year, month, day } = localParts(instant, timezone);
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** Minutes since local midnight (0-1439) in `timezone` at the given instant. */
export function localMinutesOfDay(instant: Date, timezone: string): number {
  const { hour, minute } = localParts(instant, timezone);
  return hour * 60 + minute;
}

/** How far `timezone` is ahead of UTC at the given instant, in milliseconds. */
export function timezoneOffsetMs(instant: Date, timezone: string): number {
  const { year, month, day, hour, minute, second } = localParts(instant, timezone);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return localAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant at which the calendar date "YYYY-MM-DD" begins (local 00:00) in `timezone`. */
export function startOfLocalDay(date: string, timezone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const utcGuess = Date.UTC(year, month - 1, day);
  const firstOffset = timezoneOffsetMs(new Date(utcGuess), timezone);
  let instant = utcGuess - firstOffset;
  // If the offset at the resulting instant differs (a DST change landed between the
  // guess and the answer), correct once using the offset that actually applies there.
  const secondOffset = timezoneOffsetMs(new Date(instant), timezone);
  if (secondOffset !== firstOffset) instant = utcGuess - secondOffset;
  // Where the clocks skip over local midnight (00:00 -> 01:00, as in Cuba or Chile) that
  // correction lands an hour before the day begins. The day really starts at the jump itself,
  // which is what the first reading gives.
  if (localDateInTimezone(new Date(instant), timezone) < date) instant = utcGuess - firstOffset;
  return new Date(instant);
}

/**
 * The instant at which "HH:mm" happens on calendar date "YYYY-MM-DD" in `timezone`, DST-corrected
 * the same way `startOfLocalDay` is. Unlike midnight, a working-hours boundary is never itself
 * skipped by a DST transition in practice, so no further fallback is needed here.
 */
export function instantAtLocalTimeOfDay(date: string, hhmm: string, timezone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = timezoneOffsetMs(new Date(utcGuess), timezone);
  const instant = utcGuess - firstOffset;
  const secondOffset = timezoneOffsetMs(new Date(instant), timezone);
  return new Date(secondOffset === firstOffset ? instant : utcGuess - secondOffset);
}

// --- pure calendar arithmetic on "YYYY-MM-DD" strings (timezone independent) ---

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True only for a well-formed, real calendar date (rejects 2026-02-30, 2026-13-01, 2026-9-1). */
export function isValidCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function toUtcDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUtcDate(date: Date): string {
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDaysToDate(date: string, days: number): string {
  const result = toUtcDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return fromUtcDate(result);
}

/** 0 = Sunday ... 6 = Saturday, matching UserSettings.weekStartsOn. */
export function weekdayOfDate(date: string): number {
  return toUtcDate(date).getUTCDay();
}

export function firstDayOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function lastDayOfMonth(date: string): string {
  const [year, month] = date.split('-').map(Number);
  return fromUtcDate(new Date(Date.UTC(year, month, 0)));
}

/** How many days `to` is after `from` ("YYYY-MM-DD" each); negative when `to` is earlier. */
export function daysBetweenDates(from: string, to: string): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000);
}
