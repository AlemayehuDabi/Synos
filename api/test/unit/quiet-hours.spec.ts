import { describe, expect, it } from 'vitest';
import { isWithinQuietHours, parseTimeOfDay } from '../../src/notifications/quiet-hours.js';

const at = (iso: string) => new Date(iso);

describe('parseTimeOfDay', () => {
  it('reads HH:mm as minutes since midnight', () => {
    expect(parseTimeOfDay('00:00')).toBe(0);
    expect(parseTimeOfDay('07:05')).toBe(425);
    expect(parseTimeOfDay('22:30')).toBe(1350);
    expect(parseTimeOfDay('23:59')).toBe(1439);
  });

  it('rejects anything else', () => {
    for (const bad of ['24:00', '7:00', '07:60', '07:00:00', '', '7am', '-1:00']) {
      expect(parseTimeOfDay(bad), bad).toBeNaN();
    }
  });
});

describe('isWithinQuietHours', () => {
  it('never suppresses without quiet hours', () => {
    expect(isWithinQuietHours(at('2026-09-21T03:00:00Z'), 'UTC', null)).toBe(false);
    expect(isWithinQuietHours(at('2026-09-21T03:00:00Z'), 'UTC', undefined)).toBe(false);
  });

  describe('a range inside one day (13:00-15:00)', () => {
    const quiet = { start: '13:00', end: '15:00' };
    it.each([
      ['12:59', false],
      ['13:00', true],
      ['14:59', true],
      ['15:00', false],
      ['03:00', false],
    ])('%s -> %s', (time, expected) => {
      expect(isWithinQuietHours(at(`2026-09-21T${time}:00Z`), 'UTC', quiet)).toBe(expected);
    });
  });

  describe('an overnight range (22:00-07:00)', () => {
    const quiet = { start: '22:00', end: '07:00' };
    it.each([
      ['21:59', false],
      ['22:00', true],
      ['23:30', true],
      ['00:00', true],
      ['03:15', true],
      ['06:59', true],
      ['07:00', false],
      ['12:00', false],
    ])('%s -> %s', (time, expected) => {
      expect(isWithinQuietHours(at(`2026-09-21T${time}:00Z`), 'UTC', quiet)).toBe(expected);
    });
  });

  it('handles ranges that start or end exactly at midnight', () => {
    const untilMidnight = { start: '22:00', end: '00:00' };
    expect(isWithinQuietHours(at('2026-09-21T23:59:00Z'), 'UTC', untilMidnight)).toBe(true);
    expect(isWithinQuietHours(at('2026-09-21T00:00:00Z'), 'UTC', untilMidnight)).toBe(false);

    const fromMidnight = { start: '00:00', end: '07:00' };
    expect(isWithinQuietHours(at('2026-09-21T00:00:00Z'), 'UTC', fromMidnight)).toBe(true);
    expect(isWithinQuietHours(at('2026-09-21T06:59:00Z'), 'UTC', fromMidnight)).toBe(true);
    expect(isWithinQuietHours(at('2026-09-21T07:00:00Z'), 'UTC', fromMidnight)).toBe(false);
  });

  it('reads the range on the user\'s own clock, not the server\'s', () => {
    const quiet = { start: '22:00', end: '07:00' };
    const instant = at('2026-09-21T20:00:00Z');
    expect(isWithinQuietHours(instant, 'UTC', quiet)).toBe(false); // 20:00
    expect(isWithinQuietHours(instant, 'Africa/Nairobi', quiet)).toBe(true); // 23:00
    expect(isWithinQuietHours(instant, 'America/New_York', quiet)).toBe(false); // 16:00
    expect(isWithinQuietHours(at('2026-09-21T02:00:00Z'), 'America/New_York', quiet)).toBe(true); // 22:00 the evening before
  });

  it('handles zones with half-hour offsets', () => {
    const quiet = { start: '22:00', end: '07:00' };
    expect(isWithinQuietHours(at('2026-09-21T16:29:00Z'), 'Asia/Kolkata', quiet)).toBe(false); // 21:59
    expect(isWithinQuietHours(at('2026-09-21T16:30:00Z'), 'Asia/Kolkata', quiet)).toBe(true); // 22:00
  });

  it('follows the local clock across a DST change', () => {
    const quiet = { start: '22:00', end: '07:00' };
    // US spring forward 2026-03-08: 07:00 UTC is when 02:00 EST becomes 03:00 EDT.
    expect(isWithinQuietHours(at('2026-03-08T06:59:00Z'), 'America/New_York', quiet)).toBe(true); // 01:59 EST
    expect(isWithinQuietHours(at('2026-03-08T10:59:00Z'), 'America/New_York', quiet)).toBe(true); // 06:59 EDT
    expect(isWithinQuietHours(at('2026-03-08T11:00:00Z'), 'America/New_York', quiet)).toBe(false); // 07:00 EDT
  });

  it('ignores an empty or malformed range rather than suppressing everything', () => {
    const instant = at('2026-09-21T03:00:00Z');
    expect(isWithinQuietHours(instant, 'UTC', { start: '03:00', end: '03:00' })).toBe(false);
    expect(isWithinQuietHours(instant, 'UTC', { start: '25:00', end: '07:00' })).toBe(false);
    expect(isWithinQuietHours(instant, 'UTC', { start: '22:00', end: 'morning' })).toBe(false);
  });
});
