import { describe, expect, it } from 'vitest';
import { dedupeBatch, detectWorkoutConflict, validateSampleValue, type ManualWorkoutWindow } from '../../src/fitness/wearable.js';

describe('dedupeBatch', () => {
  it('keeps the first sample per dedupeKey and counts the rest as duplicates', () => {
    const { unique, duplicates } = dedupeBatch([
      { dedupeKey: 'a', n: 1 },
      { dedupeKey: 'b', n: 2 },
      { dedupeKey: 'a', n: 3 },
      { dedupeKey: 'a', n: 4 },
    ]);
    expect(unique).toEqual([
      { dedupeKey: 'a', n: 1 },
      { dedupeKey: 'b', n: 2 },
    ]);
    expect(duplicates).toBe(2);
  });

  it('is a no-op for a batch with no repeats, and for an empty one', () => {
    expect(dedupeBatch([{ dedupeKey: 'a' }, { dedupeKey: 'b' }])).toEqual({ unique: [{ dedupeKey: 'a' }, { dedupeKey: 'b' }], duplicates: 0 });
    expect(dedupeBatch([])).toEqual({ unique: [], duplicates: 0 });
  });
});

describe('validateSampleValue', () => {
  it.each([
    ['steps', { count: 1200 }],
    ['sleep', { durationMinutes: 420 }],
    ['sleep', {}],
    ['heartRate', { bpm: 62 }],
    ['activeEnergy', { kcal: 310.5 }],
    ['workout', { workoutType: 'run', durationMinutes: 30 }],
    ['workout', {}],
  ] as const)('accepts a well-formed %s value', (type, value) => {
    expect(validateSampleValue(type, value)).toBeNull();
  });

  it.each([
    ['steps', { count: -1 }],
    ['steps', { count: 1.5 }],
    ['steps', {}],
    ['heartRate', { bpm: 0 }],
    ['activeEnergy', { kcal: 'lots' }],
    ['sleep', { durationMinutes: -10 }],
    ['workout', { workoutType: '' }],
    ['steps', 'not-an-object'],
  ] as const)('rejects a malformed %s value', (type, value) => {
    expect(validateSampleValue(type, value)).toEqual(expect.any(String));
  });

  it('keeps extra keys a device sends', () => {
    expect(validateSampleValue('steps', { count: 10, source: 'phone' })).toBeNull();
  });
});

describe('detectWorkoutConflict', () => {
  const manual = (overrides: Partial<ManualWorkoutWindow> = {}): ManualWorkoutWindow => ({
    id: 'w1',
    workoutType: 'run',
    startedAt: new Date('2026-09-24T07:00:00Z'),
    completedAt: new Date('2026-09-24T07:45:00Z'),
    durationMinutes: 45,
    ...overrides,
  });
  const sample = (startsAt: string, endsAt: string, value: unknown) => ({ startsAt: new Date(startsAt), endsAt: new Date(endsAt), value });

  it('is null when the sample overlaps nothing', () => {
    expect(detectWorkoutConflict(sample('2026-09-24T12:00:00Z', '2026-09-24T12:45:00Z', { workoutType: 'run' }), [manual()])).toBeNull();
  });

  it('is null when it overlaps and agrees (same type, similar length)', () => {
    expect(detectWorkoutConflict(sample('2026-09-24T07:02:00Z', '2026-09-24T07:46:00Z', { workoutType: 'Run' }), [manual()])).toBeNull();
  });

  it('flags an overlapping sample of a different type', () => {
    expect(detectWorkoutConflict(sample('2026-09-24T07:00:00Z', '2026-09-24T07:45:00Z', { workoutType: 'cycling' }), [manual()])).toBe('w1');
  });

  it('flags an overlapping sample whose length is clearly different', () => {
    expect(detectWorkoutConflict(sample('2026-09-24T07:00:00Z', '2026-09-24T08:30:00Z', { workoutType: 'run' }), [manual()])).toBe('w1');
  });

  it('uses the reported durationMinutes over the interval when comparing lengths', () => {
    expect(detectWorkoutConflict(sample('2026-09-24T07:00:00Z', '2026-09-24T08:30:00Z', { workoutType: 'run', durationMinutes: 44 }), [manual()])).toBeNull();
  });

  it('allows a few minutes of slack on a short workout', () => {
    const short = manual({ completedAt: new Date('2026-09-24T07:10:00Z'), durationMinutes: 10 });
    expect(detectWorkoutConflict(sample('2026-09-24T07:00:00Z', '2026-09-24T07:14:00Z', { workoutType: 'run' }), [short])).toBeNull();
    expect(detectWorkoutConflict(sample('2026-09-24T07:00:00Z', '2026-09-24T07:20:00Z', { workoutType: 'run' }), [short])).toBe('w1');
  });

  it('returns the first disagreeing overlapping workout', () => {
    const other = manual({ id: 'w2', startedAt: new Date('2026-09-24T07:30:00Z'), completedAt: new Date('2026-09-24T08:00:00Z'), durationMinutes: 30 });
    expect(detectWorkoutConflict(sample('2026-09-24T07:30:00Z', '2026-09-24T08:00:00Z', { workoutType: 'yoga' }), [manual(), other])).toBe('w1');
  });

  it('treats a manual workout with no end as an instant at its start', () => {
    const open = manual({ completedAt: null, durationMinutes: null });
    expect(detectWorkoutConflict(sample('2026-09-24T06:50:00Z', '2026-09-24T07:10:00Z', { workoutType: 'cycling' }), [open])).toBe('w1');
    expect(detectWorkoutConflict(sample('2026-09-24T07:10:00Z', '2026-09-24T07:40:00Z', { workoutType: 'cycling' }), [open])).toBeNull();
  });
});
