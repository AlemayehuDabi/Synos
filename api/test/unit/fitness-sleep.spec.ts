import { describe, expect, it } from 'vitest';
import { isSleepPoor, sleepSampleMinutes, summarizeSleepNights } from '../../src/fitness/sleep.js';

const sample = (startsAt: string, endsAt: string, value: unknown = {}) => ({ startsAt: new Date(startsAt), endsAt: new Date(endsAt), value });

describe('sleepSampleMinutes', () => {
  it('uses the device-reported duration when there is one', () => {
    expect(sleepSampleMinutes(sample('2026-09-24T22:00:00Z', '2026-09-25T06:00:00Z', { durationMinutes: 420 }))).toBe(420);
  });

  it('falls back to the interval length', () => {
    expect(sleepSampleMinutes(sample('2026-09-24T23:00:00Z', '2026-09-25T06:30:00Z'))).toBe(450);
  });

  it('ignores a nonsense reported duration', () => {
    expect(sleepSampleMinutes(sample('2026-09-24T23:00:00Z', '2026-09-25T01:00:00Z', { durationMinutes: -5 }))).toBe(120);
    expect(sleepSampleMinutes(sample('2026-09-24T23:00:00Z', '2026-09-25T01:00:00Z', { durationMinutes: 'lots' }))).toBe(120);
  });

  it('is never negative for an inverted interval', () => {
    expect(sleepSampleMinutes(sample('2026-09-25T06:00:00Z', '2026-09-25T05:00:00Z'))).toBe(0);
  });
});

describe('summarizeSleepNights', () => {
  it('totals a night by the local date it ended on', () => {
    const nights = summarizeSleepNights(
      [sample('2026-09-24T22:00:00Z', '2026-09-25T02:00:00Z'), sample('2026-09-25T02:30:00Z', '2026-09-25T06:00:00Z')],
      'UTC',
      360,
    );
    expect(nights).toEqual([{ date: '2026-09-25', durationMinutes: 450, sampleCount: 2, poor: false }]);
  });

  it('flags a night under the threshold as poor, and only that one', () => {
    const nights = summarizeSleepNights(
      [sample('2026-09-23T23:00:00Z', '2026-09-24T07:00:00Z'), sample('2026-09-24T23:30:00Z', '2026-09-25T03:30:00Z')],
      'UTC',
      360,
    );
    expect(nights.map((n) => [n.date, n.durationMinutes, n.poor])).toEqual([
      ['2026-09-24', 480, false],
      ['2026-09-25', 240, true],
    ]);
  });

  it('treats exactly the threshold as enough sleep', () => {
    expect(isSleepPoor(360, 360)).toBe(false);
    expect(isSleepPoor(359, 360)).toBe(true);
  });

  it('assigns a night to the local date in the user\'s timezone, not UTC', () => {
    // 2026-09-25T22:30Z is already 2026-09-26 01:30 in Nairobi (UTC+3).
    const nights = summarizeSleepNights([sample('2026-09-25T19:00:00Z', '2026-09-25T22:30:00Z')], 'Africa/Nairobi', 360);
    expect(nights.map((n) => n.date)).toEqual(['2026-09-26']);
  });

  it('counts a stretch reported by two devices only once', () => {
    const nights = summarizeSleepNights(
      [
        sample('2026-09-24T22:00:00Z', '2026-09-25T06:00:00Z', { durationMinutes: 480 }),
        sample('2026-09-24T22:05:00Z', '2026-09-25T05:55:00Z', { durationMinutes: 470 }),
      ],
      'UTC',
      360,
    );
    expect(nights).toEqual([{ date: '2026-09-25', durationMinutes: 480, sampleCount: 1, poor: false }]);
  });

  it('is empty with no samples', () => {
    expect(summarizeSleepNights([], 'UTC', 360)).toEqual([]);
  });

  it('returns nights in ascending date order whatever order the samples arrive in', () => {
    const nights = summarizeSleepNights(
      [sample('2026-09-24T23:00:00Z', '2026-09-25T07:00:00Z'), sample('2026-09-22T23:00:00Z', '2026-09-23T07:00:00Z')],
      'UTC',
      360,
    );
    expect(nights.map((n) => n.date)).toEqual(['2026-09-23', '2026-09-25']);
  });
});
