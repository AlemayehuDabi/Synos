import type { BodyMetric, Exercise, Prisma, Program, ProgramWorkout } from '../generated/prisma/client.js';
import type { ExerciseCategory, FitnessSource } from '../generated/prisma/enums.js';
import { localDateInTimezone } from '../common/time/timezone.js';

export const WORKOUT_INCLUDE = {
  exercises: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } },
  },
} satisfies Prisma.WorkoutInclude;

export type WorkoutWithExercises = Prisma.WorkoutGetPayload<{ include: typeof WORKOUT_INCLUDE }>;

export interface ExerciseView {
  id: string;
  name: string;
  category: ExerciseCategory;
  muscleGroups: string[];
  isCustom: boolean;
}

export const toExerciseView = (exercise: Exercise): ExerciseView => ({
  id: exercise.id,
  name: exercise.name,
  category: exercise.category,
  muscleGroups: exercise.muscleGroups,
  isCustom: exercise.isCustom,
});

export interface WorkoutSetView {
  id: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  rpe: number | null;
}

export interface WorkoutExerciseView {
  id: string;
  exerciseId: string;
  name: string;
  category: ExerciseCategory;
  sortOrder: number;
  sets: WorkoutSetView[];
}

export interface WorkoutView {
  id: string;
  title: string | null;
  workoutType: string;
  startedAt: string;
  completedAt: string | null;
  durationMinutes: number | null;
  notes: string | null;
  programId: string | null;
  source: FitnessSource;
  exercises: WorkoutExerciseView[];
  createdAt: Date;
  updatedAt: Date;
}

export function toWorkoutView(workout: WorkoutWithExercises): WorkoutView {
  return {
    id: workout.id,
    title: workout.title,
    workoutType: workout.workoutType,
    startedAt: workout.startedAt.toISOString(),
    completedAt: workout.completedAt?.toISOString() ?? null,
    durationMinutes: workout.durationMinutes,
    notes: workout.notes,
    programId: workout.programId,
    source: workout.source,
    exercises: workout.exercises.map((entry) => ({
      id: entry.id,
      exerciseId: entry.exerciseId,
      name: entry.exercise.name,
      category: entry.exercise.category,
      sortOrder: entry.sortOrder,
      sets: entry.sets.map((set) => ({
        id: set.id,
        setNumber: set.setNumber,
        reps: set.reps,
        weightKg: set.weightKg,
        durationSeconds: set.durationSeconds,
        distanceMeters: set.distanceMeters,
        rpe: set.rpe,
      })),
    })),
    createdAt: workout.createdAt,
    updatedAt: workout.updatedAt,
  };
}

export interface ProgramView {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  activatedAt: string | null;
  workouts: { id: string; dayOffset: number; workoutTemplate: unknown }[];
  createdAt: Date;
  updatedAt: Date;
}

export function toProgramView(program: Program & { workouts: ProgramWorkout[] }): ProgramView {
  return {
    id: program.id,
    name: program.name,
    description: program.description,
    isActive: program.isActive,
    activatedAt: program.activatedAt?.toISOString() ?? null,
    workouts: [...program.workouts]
      .sort((a, b) => a.dayOffset - b.dayOffset || a.id.localeCompare(b.id))
      .map((w) => ({ id: w.id, dayOffset: w.dayOffset, workoutTemplate: w.workoutTemplate })),
    createdAt: program.createdAt,
    updatedAt: program.updatedAt,
  };
}

export interface BodyMetricView {
  id: string;
  date: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  notes: string | null;
  source: FitnessSource;
  createdAt: Date;
  updatedAt: Date;
}

/** `date` is stored as a UTC midnight; reading it back as UTC recovers the exact "YYYY-MM-DD" it was written with. */
export const toBodyMetricView = (metric: BodyMetric): BodyMetricView => ({
  id: metric.id,
  date: localDateInTimezone(metric.date, 'UTC'),
  weightKg: metric.weightKg,
  bodyFatPct: metric.bodyFatPct,
  notes: metric.notes,
  source: metric.source,
  createdAt: metric.createdAt,
  updatedAt: metric.updatedAt,
});
