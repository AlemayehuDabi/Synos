import { describe, expect, it } from 'vitest';
import {
  addDaysToDate,
  firstDayOfMonth,
  isValidCalendarDate,
  lastDayOfMonth,
  localDateInTimezone,
  localMinutesOfDay,
  localParts,
  startOfLocalDay,
  weekdayOfDate,
} from '../../src/common/time/timezone.js';

describe('local time', () => {
  it('reads the wall clock in a timezone', () => {
    expect(localParts(new Date('2026-09-21T10:30:15Z'), 'Africa/Nairobi')).toEqual({
      year: 2026,
      month: 9,
      day: 21,
      hour: 13,
      minute: 30,
      second: 15,
    });
  });

  it('puts the same instant on different calendar dates in different timezones', () => {
    const instant = new Date('2026-09-20T22:00:00Z');
    expect(localDateInTimezone(instant, 'UTC')).toBe('2026-09-20');
    expect(localDateInTimezone(instant, 'Pacific/Auckland')).toBe('2026-09-21');
    expect(localDateInTimezone(instant, 'America/Los_Angeles')).toBe('2026-09-20');
  });

  it('reports midnight as 00:xx, never 24:xx', () => {
    expect(localMinutesOfDay(new Date('2026-09-21T00:05:00Z'), 'UTC')).toBe(5);
    expect(localParts(new Date('2026-09-21T00:00:00Z'), 'UTC').hour).toBe(0);
  });

  it('handles half-hour offsets', () => {
    expect(localMinutesOfDay(new Date('2026-09-21T17:00:00Z'), 'Asia/Kolkata')).toBe(22 * 60 + 30);
  });
});

describe('startOfLocalDay', () => {
  it('is UTC midnight for UTC', () => {
    expect(startOfLocalDay('2026-09-21', 'UTC').toISOString()).toBe('2026-09-21T00:00:00.000Z');
  });

  it('subtracts the offset for zones ahead of UTC and adds it for zones behind', () => {
    expect(startOfLocalDay('2026-09-21', 'Africa/Nairobi').toISOString()).toBe('2026-09-20T21:00:00.000Z');
    expect(startOfLocalDay('2026-09-21', 'America/Los_Angeles').toISOString()).toBe('2026-09-21T07:00:00.000Z');
    expect(startOfLocalDay('2026-09-21', 'Pacific/Kiritimati').toISOString()).toBe('2026-09-20T10:00:00.000Z');
  });

  it('uses the offset in force at that midnight across a DST change', () => {
    // US spring forward: 2026-03-08 02:00 EST -> 03:00 EDT
    expect(startOfLocalDay('2026-03-08', 'America/New_York').toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(startOfLocalDay('2026-03-09', 'America/New_York').toISOString()).toBe('2026-03-09T04:00:00.000Z');
    // US fall back: 2026-11-01 02:00 EDT -> 01:00 EST
    expect(startOfLocalDay('2026-11-01', 'America/New_York').toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(startOfLocalDay('2026-11-02', 'America/New_York').toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });

  it('starts the day at the jump when the clocks skip local midnight', () => {
    // Cuba: 2026-03-08 00:00 CST jumps straight to 01:00 CDT, so there is no midnight.
    const start = startOfLocalDay('2026-03-08', 'America/Havana');
    expect(start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(localDateInTimezone(start, 'America/Havana')).toBe('2026-03-08');
    expect(localDateInTimezone(new Date(start.getTime() - 1), 'America/Havana')).toBe('2026-03-07');
  });

  it('takes the first of the two midnights when the clocks fall back over it', () => {
    // Cuba: 2026-11-01 01:00 CDT falls back to 00:00 CST, so local midnight happens twice.
    expect(startOfLocalDay('2026-11-01', 'America/Havana').toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });

  it('is always the first instant of the requested date', () => {
    for (const timezone of ['UTC', 'Africa/Nairobi', 'America/New_York', 'America/Havana', 'America/Santiago', 'Asia/Beirut', 'Pacific/Auckland']) {
      for (const date of ['2026-03-08', '2026-03-29', '2026-09-06', '2026-09-27', '2026-10-25', '2026-11-01']) {
        const start = startOfLocalDay(date, timezone);
        expect(localDateInTimezone(start, timezone), `${date} in ${timezone}`).toBe(date);
        expect(localDateInTimezone(new Date(start.getTime() - 1), timezone), `${date} in ${timezone}, 1ms earlier`).toBe(
          addDaysToDate(date, -1),
        );
      }
    }
  });
});

describe('calendar arithmetic', () => {
  it('accepts only real, well-formed dates', () => {
    for (const valid of ['2026-02-28', '2028-02-29', '2026-12-31', '0999-01-01']) {
      expect(isValidCalendarDate(valid), valid).toBe(true);
    }
    for (const invalid of ['2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '2026-09-31', '2026-9-1', '', '2026-09-21T00:00', 'today']) {
      expect(isValidCalendarDate(invalid), invalid).toBe(false);
    }
  });

  it('adds and subtracts days across month, year and leap boundaries', () => {
    expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysToDate('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDaysToDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysToDate('2026-09-21', 0)).toBe('2026-09-21');
    expect(addDaysToDate('2026-09-21', -21)).toBe('2026-08-31');
  });

  it('numbers weekdays from Sunday = 0', () => {
    expect(weekdayOfDate('2026-09-20')).toBe(0);
    expect(weekdayOfDate('2026-09-21')).toBe(1);
    expect(weekdayOfDate('2026-09-26')).toBe(6);
  });

  it('finds the first and last day of a month', () => {
    expect(firstDayOfMonth('2026-09-21')).toBe('2026-09-01');
    expect(lastDayOfMonth('2026-09-21')).toBe('2026-09-30');
    expect(lastDayOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(lastDayOfMonth('2027-02-10')).toBe('2027-02-28');
    expect(lastDayOfMonth('2026-12-01')).toBe('2026-12-31');
  });
});
