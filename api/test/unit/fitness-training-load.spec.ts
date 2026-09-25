import { describe, expect, it } from 'vitest';
import { DEFAULT_RPE, isHeavyLoad, trainingLoad, workoutDurationMinutes, workoutLoad } from '../../src/fitness/training-load.js';

const workout = (overrides: Partial<Parameters<typeof workoutLoad>[0]> = {}) => ({
  durationMinutes: 60,
  startedAt: new Date('2026-09-24T07:00:00Z'),
  completedAt: new Date('2026-09-24T08:00:00Z'),
  rpes: [] as number[],
  ...overrides,
});

describe('workoutDurationMinutes', () => {
  it('prefers the recorded duration', () => {
    expect(workoutDurationMinutes(workout({ durationMinutes: 45 }))).toBe(45);
  });

  it('derives it from the timestamps when none was recorded', () => {
    expect(workoutDurationMinutes(workout({ durationMinutes: null }))).toBe(60);
  });

  it('is 0 for a workout that has neither a duration nor an end', () => {
    expect(workoutDurationMinutes(workout({ durationMinutes: null, completedAt: null }))).toBe(0);
  });
});

describe('workoutLoad', () => {
  it('multiplies minutes by the average RPE of the sets that recorded one', () => {
    expect(workoutLoad(workout({ rpes: [6, 8] }))).toBe(60 * 7);
  });

  it('assumes a moderate RPE when no set recorded one', () => {
    expect(workoutLoad(workout())).toBe(60 * DEFAULT_RPE);
  });
});

describe('trainingLoad / isHeavyLoad', () => {
  it('sums the load of every workout, rounded', () => {
    expect(trainingLoad([workout({ rpes: [7] }), workout({ durationMinutes: 30, rpes: [5, 6] })])).toBe(Math.round(60 * 7 + 30 * 5.5));
  });

  it('is 0 with no workouts', () => {
    expect(trainingLoad([])).toBe(0);
  });

  it('is heavy exactly at the threshold, not below it', () => {
    expect(isHeavyLoad(2500, 2500)).toBe(true);
    expect(isHeavyLoad(2499, 2500)).toBe(false);
  });
});
