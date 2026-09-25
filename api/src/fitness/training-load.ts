/** Session-RPE style load: minutes trained x how hard it felt (1-10). */
export const DEFAULT_RPE = 5;
/** How far back training.heavy looks. */
export const LOAD_WINDOW_DAYS = 7;

export interface LoadWorkout {
  durationMinutes: number | null;
  startedAt: Date;
  completedAt: Date | null;
  /** The RPE of every set in the workout that recorded one. */
  rpes: number[];
}

export function workoutDurationMinutes(workout: Pick<LoadWorkout, 'durationMinutes' | 'startedAt' | 'completedAt'>): number {
  if (workout.durationMinutes != null) return Math.max(0, workout.durationMinutes);
  if (!workout.completedAt) return 0;
  return Math.max(0, Math.round((workout.completedAt.getTime() - workout.startedAt.getTime()) / 60_000));
}

export function workoutLoad(workout: LoadWorkout): number {
  const rpe = workout.rpes.length > 0 ? workout.rpes.reduce((sum, value) => sum + value, 0) / workout.rpes.length : DEFAULT_RPE;
  return workoutDurationMinutes(workout) * rpe;
}

export function trainingLoad(workouts: LoadWorkout[]): number {
  return Math.round(workouts.reduce((sum, workout) => sum + workoutLoad(workout), 0));
}

export function isHeavyLoad(load: number, threshold: number): boolean {
  return load >= threshold;
}
