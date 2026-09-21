import { describe, expect, it } from 'vitest';
import {
  daysSincePeriodEnded,
  periodFromDates,
  previousMonthPeriod,
  previousWeekPeriod,
} from '../../src/reviews/review-periods.js';

const at = (iso: string) => new Date(iso);
const hoursBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;

describe('previousWeekPeriod', () => {
  // 2026-09-21 is a Monday.
  const monday = at('2026-09-21T10:00:00Z');

  it('is the last complete Monday-to-Sunday week when weeks start on Monday', () => {
    const period = previousWeekPeriod(monday, 'UTC', 1);
    expect(period).toMatchObject({ type: 'weekly', startDate: '2026-09-14', endDate: '2026-09-20' });
    expect(period.periodStart.toISOString()).toBe('2026-09-14T00:00:00.000Z');
    expect(period.periodEnd.toISOString()).toBe('2026-09-21T00:00:00.000Z');
  });

  it('respects each user\'s week start', () => {
    expect(previousWeekPeriod(monday, 'UTC', 0)).toMatchObject({ startDate: '2026-09-13', endDate: '2026-09-19' }); // Sun-Sat
    expect(previousWeekPeriod(monday, 'UTC', 6)).toMatchObject({ startDate: '2026-09-12', endDate: '2026-09-18' }); // Sat-Fri
    expect(previousWeekPeriod(monday, 'UTC', 3)).toMatchObject({ startDate: '2026-09-09', endDate: '2026-09-15' }); // Wed-Tue
  });

  it('is always seven days long and ends the day before a new week begins', () => {
    for (let weekStartsOn = 0; weekStartsOn <= 6; weekStartsOn += 1) {
      for (let day = 0; day < 14; day += 1) {
        const now = new Date(at('2026-09-14T12:00:00Z').getTime() + day * 86_400_000);
        const period = previousWeekPeriod(now, 'UTC', weekStartsOn);
        expect(hoursBetween(period.periodStart, period.periodEnd), `start ${weekStartsOn}, day ${day}`).toBe(168);
        expect(new Date(`${period.startDate}T00:00:00Z`).getUTCDay(), `start ${weekStartsOn}, day ${day}`).toBe(weekStartsOn);
      }
    }
  });

  it('stays on the same week for the whole of the day a new week starts, then the whole next week', () => {
    const during = (iso: string) => previousWeekPeriod(at(iso), 'UTC', 1).startDate;
    expect(during('2026-09-21T00:00:00Z')).toBe('2026-09-14');
    expect(during('2026-09-21T23:59:59Z')).toBe('2026-09-14');
    expect(during('2026-09-27T23:59:59Z')).toBe('2026-09-14'); // Sunday: the week is not over yet
    expect(during('2026-09-28T00:00:00Z')).toBe('2026-09-21');
  });

  it('reads "now" on the user\'s calendar, so one instant can fall in different weeks', () => {
    const instant = at('2026-09-20T22:00:00Z'); // Sunday 22:00 UTC, already Monday morning in Auckland
    expect(previousWeekPeriod(instant, 'UTC', 1).startDate).toBe('2026-09-07');
    const auckland = previousWeekPeriod(instant, 'Pacific/Auckland', 1);
    expect(auckland).toMatchObject({ startDate: '2026-09-14', endDate: '2026-09-20' });
    expect(auckland.periodStart.toISOString()).toBe('2026-09-13T12:00:00.000Z');
    expect(auckland.periodEnd.toISOString()).toBe('2026-09-20T12:00:00.000Z');
  });

  it('cuts the period at local midnight for zones behind UTC', () => {
    const instant = at('2026-09-21T03:00:00Z'); // still Sunday evening in Los Angeles
    const losAngeles = previousWeekPeriod(instant, 'America/Los_Angeles', 1);
    expect(losAngeles).toMatchObject({ startDate: '2026-09-07', endDate: '2026-09-13' });
    expect(losAngeles.periodStart.toISOString()).toBe('2026-09-07T07:00:00.000Z');
    expect(losAngeles.periodEnd.toISOString()).toBe('2026-09-14T07:00:00.000Z');
  });

  it('is one hour longer across the autumn clock change and one shorter across the spring one', () => {
    const fallBack = previousWeekPeriod(at('2026-11-02T15:00:00Z'), 'America/New_York', 1);
    expect(fallBack).toMatchObject({ startDate: '2026-10-26', endDate: '2026-11-01' });
    expect(fallBack.periodStart.toISOString()).toBe('2026-10-26T04:00:00.000Z');
    expect(fallBack.periodEnd.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect(hoursBetween(fallBack.periodStart, fallBack.periodEnd)).toBe(169);

    const springForward = previousWeekPeriod(at('2026-03-09T15:00:00Z'), 'America/New_York', 1);
    expect(springForward).toMatchObject({ startDate: '2026-03-02', endDate: '2026-03-08' });
    expect(hoursBetween(springForward.periodStart, springForward.periodEnd)).toBe(167);
  });

  it('crosses a year boundary', () => {
    expect(previousWeekPeriod(at('2027-01-03T12:00:00Z'), 'UTC', 1)).toMatchObject({
      startDate: '2026-12-21',
      endDate: '2026-12-27',
    });
    expect(previousWeekPeriod(at('2027-01-04T00:30:00Z'), 'UTC', 1)).toMatchObject({
      startDate: '2026-12-28',
      endDate: '2027-01-03',
    });
  });
});

describe('previousMonthPeriod', () => {
  it('is the last complete calendar month', () => {
    const period = previousMonthPeriod(at('2026-09-21T10:00:00Z'), 'UTC');
    expect(period).toMatchObject({ type: 'monthly', startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(period.periodStart.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(period.periodEnd.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('changes on the first of the month, on the user\'s calendar', () => {
    expect(previousMonthPeriod(at('2026-09-30T23:59:59Z'), 'UTC').startDate).toBe('2026-08-01');
    expect(previousMonthPeriod(at('2026-10-01T00:00:00Z'), 'UTC').startDate).toBe('2026-09-01');

    const instant = at('2026-09-30T20:00:00Z');
    expect(previousMonthPeriod(instant, 'UTC').startDate).toBe('2026-08-01');
    const kiritimati = previousMonthPeriod(instant, 'Pacific/Kiritimati'); // UTC+14: already 1 October
    expect(kiritimati).toMatchObject({ startDate: '2026-09-01', endDate: '2026-09-30' });
    expect(kiritimati.periodStart.toISOString()).toBe('2026-08-31T10:00:00.000Z');
    expect(kiritimati.periodEnd.toISOString()).toBe('2026-09-30T10:00:00.000Z');
    expect(previousMonthPeriod(instant, 'America/Los_Angeles').startDate).toBe('2026-08-01');
  });

  it('gets month lengths right, including leap years', () => {
    expect(previousMonthPeriod(at('2028-03-05T12:00:00Z'), 'UTC')).toMatchObject({ startDate: '2028-02-01', endDate: '2028-02-29' });
    expect(previousMonthPeriod(at('2027-03-05T12:00:00Z'), 'UTC')).toMatchObject({ startDate: '2027-02-01', endDate: '2027-02-28' });
    expect(previousMonthPeriod(at('2026-05-05T12:00:00Z'), 'UTC')).toMatchObject({ startDate: '2026-04-01', endDate: '2026-04-30' });
  });

  it('crosses a year boundary in both directions', () => {
    expect(previousMonthPeriod(at('2026-01-15T12:00:00Z'), 'UTC')).toMatchObject({ startDate: '2025-12-01', endDate: '2025-12-31' });
    expect(previousMonthPeriod(at('2027-01-03T12:00:00Z'), 'UTC')).toMatchObject({ startDate: '2026-12-01', endDate: '2026-12-31' });
  });

  it('uses the offset in force at each end of the month', () => {
    // March 2026 in New York starts in EST (UTC-5) and ends in EDT (UTC-4).
    const period = previousMonthPeriod(at('2026-04-02T15:00:00Z'), 'America/New_York');
    expect(period.periodStart.toISOString()).toBe('2026-03-01T05:00:00.000Z');
    expect(period.periodEnd.toISOString()).toBe('2026-04-01T04:00:00.000Z');
  });
});

describe('periodFromDates', () => {
  it('spans from the first local midnight to the one after the last day', () => {
    const period = periodFromDates('weekly', '2026-09-14', '2026-09-20', 'Africa/Nairobi');
    expect(period.periodStart.toISOString()).toBe('2026-09-13T21:00:00.000Z');
    expect(period.periodEnd.toISOString()).toBe('2026-09-20T21:00:00.000Z');
  });
});

describe('daysSincePeriodEnded', () => {
  const week = previousWeekPeriod(at('2026-09-21T10:00:00Z'), 'UTC', 1); // 2026-09-14 .. 2026-09-20

  it('is 0 on the day the next period starts and counts local days from there', () => {
    expect(daysSincePeriodEnded(week, at('2026-09-21T00:30:00Z'), 'UTC')).toBe(0);
    expect(daysSincePeriodEnded(week, at('2026-09-21T23:30:00Z'), 'UTC')).toBe(0);
    expect(daysSincePeriodEnded(week, at('2026-09-22T00:30:00Z'), 'UTC')).toBe(1);
    expect(daysSincePeriodEnded(week, at('2026-09-24T12:00:00Z'), 'UTC')).toBe(3);
  });

  it('counts on the user\'s calendar', () => {
    // 2026-09-21T13:00Z is already Tuesday 2026-09-22 in Auckland (NZST, UTC+12).
    expect(daysSincePeriodEnded(week, at('2026-09-21T13:00:00Z'), 'Pacific/Auckland')).toBe(1);
    expect(daysSincePeriodEnded(week, at('2026-09-21T13:00:00Z'), 'UTC')).toBe(0);
  });
});
