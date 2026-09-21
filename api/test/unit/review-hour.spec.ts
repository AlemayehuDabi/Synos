import { describe, expect, it } from 'vitest';
import { isReviewHour } from '../../src/reviews/review-generation.service.js';

describe('isReviewHour', () => {
  it('is true during the 02:00 hour on the user\'s own clock', () => {
    expect(isReviewHour(new Date('2026-09-21T02:00:00Z'), 'UTC')).toBe(true);
    expect(isReviewHour(new Date('2026-09-21T02:59:59Z'), 'UTC')).toBe(true);
    expect(isReviewHour(new Date('2026-09-21T01:59:59Z'), 'UTC')).toBe(false);
    expect(isReviewHour(new Date('2026-09-21T03:00:00Z'), 'UTC')).toBe(false);
  });

  it('follows the timezone, so each part of the world is served at a different UTC hour', () => {
    expect(isReviewHour(new Date('2026-09-20T23:30:00Z'), 'Africa/Nairobi')).toBe(true); // 02:30 there
    expect(isReviewHour(new Date('2026-09-20T23:30:00Z'), 'UTC')).toBe(false);
    expect(isReviewHour(new Date('2026-09-21T09:15:00Z'), 'America/Los_Angeles')).toBe(true); // 02:15 PDT
    expect(isReviewHour(new Date('2026-09-21T14:30:00Z'), 'Pacific/Auckland')).toBe(true); // 02:30 NZST next day
  });

  it('accepts a different hour', () => {
    expect(isReviewHour(new Date('2026-09-21T05:00:00Z'), 'UTC', 5)).toBe(true);
  });

  it('is false for an unknown timezone instead of throwing', () => {
    expect(isReviewHour(new Date('2026-09-21T02:00:00Z'), 'Not/AZone')).toBe(false);
  });
});
