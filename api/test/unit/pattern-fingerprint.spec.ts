import { describe, expect, it } from 'vitest';
import { averageCadenceDays, taskFingerprint } from '../../src/tasks/pattern-fingerprint.js';

describe('taskFingerprint', () => {
  it('is stable for identical titles', () => {
    expect(taskFingerprint('Pay rent')).toBe(taskFingerprint('Pay rent'));
  });

  it('normalizes case', () => {
    expect(taskFingerprint('Pay Rent')).toBe(taskFingerprint('pay rent'));
  });

  it('normalizes surrounding whitespace', () => {
    expect(taskFingerprint('  Pay rent  ')).toBe(taskFingerprint('Pay rent'));
  });

  it('collapses internal whitespace runs to a single space', () => {
    expect(taskFingerprint('Pay   rent')).toBe(taskFingerprint('Pay rent'));
    expect(taskFingerprint('Pay\trent')).toBe(taskFingerprint('Pay rent'));
  });

  it('differs for genuinely different titles', () => {
    expect(taskFingerprint('Pay rent')).not.toBe(taskFingerprint('Pay bills'));
  });

  it('does not fuzzy-match near-duplicates', () => {
    expect(taskFingerprint('Pay rent')).not.toBe(taskFingerprint('Pay the rent'));
  });
});

describe('averageCadenceDays', () => {
  it('throws with fewer than 2 dates', () => {
    expect(() => averageCadenceDays([])).toThrow();
    expect(() => averageCadenceDays([new Date('2026-01-01')])).toThrow();
  });

  it('computes the exact gap for 2 dates', () => {
    expect(averageCadenceDays([new Date('2026-01-01T00:00:00Z'), new Date('2026-01-08T00:00:00Z')])).toBe(7);
  });

  it('averages evenly-spaced gaps', () => {
    const dates = [new Date('2026-01-01T00:00:00Z'), new Date('2026-01-15T00:00:00Z'), new Date('2026-01-29T00:00:00Z')];
    expect(averageCadenceDays(dates)).toBe(14);
  });

  it('rounds to the nearest whole day for uneven gaps', () => {
    // gaps of 10 and 11 days -> average 10.5 -> rounds to 11 (banker's-free Math.round)
    const dates = [new Date('2026-01-01T00:00:00Z'), new Date('2026-01-11T00:00:00Z'), new Date('2026-01-22T00:00:00Z')];
    expect(averageCadenceDays(dates)).toBe(11);
  });

  it('floors at 1 day even for same-day creations', () => {
    const dates = [new Date('2026-01-01T09:00:00Z'), new Date('2026-01-01T15:00:00Z')];
    expect(averageCadenceDays(dates)).toBe(1);
  });

  it('is order-sensitive (expects ascending input) but only reads first/last', () => {
    const dates = [new Date('2026-01-01T00:00:00Z'), new Date('2026-01-05T00:00:00Z'), new Date('2026-01-08T00:00:00Z')];
    expect(averageCadenceDays(dates)).toBe(4);
  });
});
