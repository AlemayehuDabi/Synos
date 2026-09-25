import { z } from 'zod';
import type { WearableSampleType } from '../generated/prisma/enums.js';

const nonNegative = z.number().finite().nonnegative();

/** What `value` must look like per sample type. Extra keys a device sends are kept. */
const valueSchemas = {
  steps: z.looseObject({ count: z.number().int().nonnegative() }),
  sleep: z.looseObject({ durationMinutes: nonNegative.optional() }),
  heartRate: z.looseObject({ bpm: z.number().finite().positive() }),
  activeEnergy: z.looseObject({ kcal: nonNegative }),
  workout: z.looseObject({ workoutType: z.string().min(1).max(50).optional(), durationMinutes: nonNegative.optional() }),
} satisfies Record<WearableSampleType, z.ZodType>;

/** A human-readable problem with `value` for this sample type, or null when it is fine. */
export function validateSampleValue(type: WearableSampleType, value: unknown): string | null {
  const parsed = valueSchemas[type].safeParse(value);
  if (parsed.success) return null;
  return parsed.error.issues.map((issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`).join('; ');
}

/** Keeps the first sample for each dedupeKey; how many later ones were dropped is `duplicates`. */
export function dedupeBatch<T extends { dedupeKey: string }>(samples: T[]): { unique: T[]; duplicates: number } {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const sample of samples) {
    if (seen.has(sample.dedupeKey)) continue;
    seen.add(sample.dedupeKey);
    unique.push(sample);
  }
  return { unique, duplicates: samples.length - unique.length };
}

export interface ManualWorkoutWindow {
  id: string;
  workoutType: string;
  startedAt: Date;
  completedAt: Date | null;
  durationMinutes: number | null;
}

/** Sessions this close in length, in minutes (or this close in proportion), count as the same one. */
const DURATION_TOLERANCE_MINUTES = 5;
const DURATION_TOLERANCE_RATIO = 0.2;

function manualEnd(workout: ManualWorkoutWindow): Date {
  if (workout.completedAt) return workout.completedAt;
  if (workout.durationMinutes != null) return new Date(workout.startedAt.getTime() + workout.durationMinutes * 60_000);
  return workout.startedAt;
}

function manualMinutes(workout: ManualWorkoutWindow): number | null {
  if (workout.durationMinutes != null) return workout.durationMinutes;
  if (workout.completedAt) return Math.round((workout.completedAt.getTime() - workout.startedAt.getTime()) / 60_000);
  return null;
}

/**
 * The id of a manual workout whose time window this `workout` sample overlaps but
 * disagrees with (a different type, or a clearly different length), else null. A sample
 * that overlaps and agrees is fine: it is stored as its own row either way and never
 * merged into or overwriting the manual workout.
 */
export function detectWorkoutConflict(
  sample: { startsAt: Date; endsAt: Date; value: unknown },
  manualWorkouts: ManualWorkoutWindow[],
): string | null {
  const value = (sample.value ?? {}) as { workoutType?: unknown; durationMinutes?: unknown };
  const sampleMinutes =
    typeof value.durationMinutes === 'number' ? value.durationMinutes : Math.round((sample.endsAt.getTime() - sample.startsAt.getTime()) / 60_000);

  for (const workout of manualWorkouts) {
    const overlaps = workout.startedAt <= sample.endsAt && manualEnd(workout) >= sample.startsAt;
    if (!overlaps) continue;

    const typeDisagrees =
      typeof value.workoutType === 'string' && value.workoutType.trim().toLowerCase() !== workout.workoutType.trim().toLowerCase();
    const minutes = manualMinutes(workout);
    const durationDisagrees =
      minutes != null && Math.abs(sampleMinutes - minutes) > Math.max(DURATION_TOLERANCE_MINUTES, minutes * DURATION_TOLERANCE_RATIO);
    if (typeDisagrees || durationDisagrees) return workout.id;
  }
  return null;
}
