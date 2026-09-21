import type { ReviewType } from '../generated/prisma/enums.js';
import {
  addDaysToDate,
  firstDayOfMonth,
  localDateInTimezone,
  startOfLocalDay,
  weekdayOfDate,
} from '../common/time/timezone.js';

export interface ReviewPeriod {
  type: ReviewType;
  /** First and last local calendar day covered, "YYYY-MM-DD", both inclusive. */
  startDate: string;
  endDate: string;
  /** The instant the first day begins in the user's timezone (inclusive). */
  periodStart: Date;
  /** The instant the day after the last day begins (exclusive). Query with `>= periodStart AND < periodEnd`. */
  periodEnd: Date;
}

/** Turns two local calendar dates into the exact instants they span in `timezone`. */
export function periodFromDates(type: ReviewType, startDate: string, endDate: string, timezone: string): ReviewPeriod {
  return {
    type,
    startDate,
    endDate,
    periodStart: startOfLocalDay(startDate, timezone),
    periodEnd: startOfLocalDay(addDaysToDate(endDate, 1), timezone),
  };
}

/**
 * The most recent *complete* week as seen from `now` in the user's timezone, where a
 * week starts on `weekStartsOn` (0 = Sunday ... 6 = Saturday, like UserSettings).
 * "Now" is read on the user's own calendar, so the same instant can be in different
 * weeks for two users.
 */
export function previousWeekPeriod(now: Date, timezone: string, weekStartsOn: number): ReviewPeriod {
  const today = localDateInTimezone(now, timezone);
  const daysIntoWeek = (weekdayOfDate(today) - weekStartsOn + 7) % 7;
  const thisWeekStart = addDaysToDate(today, -daysIntoWeek);
  return periodFromDates('weekly', addDaysToDate(thisWeekStart, -7), addDaysToDate(thisWeekStart, -1), timezone);
}

/** The most recent complete calendar month as seen from `now` in the user's timezone. */
export function previousMonthPeriod(now: Date, timezone: string): ReviewPeriod {
  const today = localDateInTimezone(now, timezone);
  const lastDayOfPreviousMonth = addDaysToDate(firstDayOfMonth(today), -1);
  return periodFromDates('monthly', firstDayOfMonth(lastDayOfPreviousMonth), lastDayOfPreviousMonth, timezone);
}

/** How many local days ago the next period began: 0 on the day a new week/month starts. */
export function daysSincePeriodEnded(period: ReviewPeriod, now: Date, timezone: string): number {
  const firstDayOfNextPeriod = addDaysToDate(period.endDate, 1);
  const today = localDateInTimezone(now, timezone);
  const toDay = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
  return Math.round(toDay(today) - toDay(firstDayOfNextPeriod));
}
