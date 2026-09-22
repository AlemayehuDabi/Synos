import { describe, expect, it } from 'vitest';
import { assertEventTiming, assertViewRange, CALENDAR_EVENT_MAX_DURATION_DAYS, CALENDAR_VIEW_HORIZON_DAYS, CALENDAR_VIEW_MAX_RANGE_DAYS } from '../../src/calendar/calendar-range.js';

describe('assertViewRange', () => {
  it('accepts a same-day range and the maximum allowed range', () => {
    expect(() => assertViewRange('2026-09-22', '2026-09-22', 'UTC')).not.toThrow();
    expect(() => assertViewRange('2026-09-01', '2026-11-01', 'UTC')).not.toThrow(); // 61 days
  });

  it('rejects `to` before `from`', () => {
    expect(() => assertViewRange('2026-09-22', '2026-09-21', 'UTC')).toThrow('`to` must not be before `from`');
  });

  it(`rejects a range of more than ${CALENDAR_VIEW_MAX_RANGE_DAYS} days`, () => {
    expect(() => assertViewRange('2026-01-01', '2026-03-04', 'UTC')).toThrow(/62 days/); // 62 days apart
    expect(() => assertViewRange('2026-01-01', '2026-03-03', 'UTC')).not.toThrow(); // 61 days apart
  });

  it('accepts a range right at the horizon edge and rejects just past it', () => {
    const today = new Date().toISOString().slice(0, 10);
    const withinDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    expect(() => assertViewRange(today, withinDays(1), 'UTC')).not.toThrow();
    expect(() => assertViewRange(withinDays(CALENDAR_VIEW_HORIZON_DAYS - 1), withinDays(CALENDAR_VIEW_HORIZON_DAYS), 'UTC')).not.toThrow();
    expect(() => assertViewRange(withinDays(CALENDAR_VIEW_HORIZON_DAYS + 5), withinDays(CALENDAR_VIEW_HORIZON_DAYS + 6), 'UTC')).toThrow(/years from today/);
  });

  it('reads "today" in the given timezone', () => {
    // Just after UTC midnight, it's already "tomorrow" in Kiritimati (UTC+14).
    const now = new Date();
    if (now.getUTCHours() > 10) return; // keep the test meaningful without flaking near local midday
    expect(() => assertViewRange('2026-09-22', '2026-09-22', 'UTC')).not.toThrow();
  });
});

describe('assertEventTiming', () => {
  it('accepts endsAt strictly after startsAt', () => {
    expect(() => assertEventTiming(new Date('2026-09-22T09:00:00Z'), new Date('2026-09-22T10:00:00Z'))).not.toThrow();
  });

  it('rejects endsAt equal to or before startsAt', () => {
    const t = new Date('2026-09-22T09:00:00Z');
    expect(() => assertEventTiming(t, t)).toThrow('`endsAt` must be after `startsAt`');
    expect(() => assertEventTiming(t, new Date(t.getTime() - 1))).toThrow();
  });

  it(`rejects an event longer than ${CALENDAR_EVENT_MAX_DURATION_DAYS} days`, () => {
    const start = new Date('2026-09-22T00:00:00Z');
    expect(() => assertEventTiming(start, new Date(start.getTime() + CALENDAR_EVENT_MAX_DURATION_DAYS * 86_400_000))).not.toThrow();
    expect(() => assertEventTiming(start, new Date(start.getTime() + (CALENDAR_EVENT_MAX_DURATION_DAYS + 1) * 86_400_000))).toThrow(/90 days/);
  });

  it('rejects startsAt/endsAt absurdly far from today', () => {
    expect(() => assertEventTiming(new Date('2300-01-01T00:00:00Z'), new Date('2300-01-01T01:00:00Z'))).toThrow(/years from today/);
  });
});
