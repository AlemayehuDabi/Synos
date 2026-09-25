-- CreateEnum
CREATE TYPE "FitnessSource" AS ENUM ('manual', 'suggestion', 'auto', 'sync');

-- CreateEnum
CREATE TYPE "ExerciseCategory" AS ENUM ('strength', 'cardio', 'flexibility', 'mobility', 'sports', 'other');

-- CreateEnum
CREATE TYPE "WearableSampleType" AS ENUM ('steps', 'sleep', 'heartRate', 'activeEnergy', 'workout');

-- CreateTable
CREATE TABLE "exercises" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "userId" UUID,
    "name" TEXT NOT NULL,
    "category" "ExerciseCategory" NOT NULL,
    "muscleGroups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workouts" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "userId" UUID NOT NULL,
    "title" TEXT,
    "workoutType" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "notes" TEXT,
    "programId" UUID,
    "source" "FitnessSource" NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "workouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_exercises" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "workoutId" UUID NOT NULL,
    "exerciseId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "workout_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_sets" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "workoutExerciseId" UUID NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "reps" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "durationSeconds" INTEGER,
    "distanceMeters" DOUBLE PRECISION,
    "rpe" DOUBLE PRECISION,

    CONSTRAINT "workout_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_workouts" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "programId" UUID NOT NULL,
    "dayOffset" INTEGER NOT NULL,
    "workoutTemplate" JSONB NOT NULL,

    CONSTRAINT "program_workouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "body_metrics" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "userId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "weightKg" DOUBLE PRECISION,
    "bodyFatPct" DOUBLE PRECISION,
    "notes" TEXT,
    "source" "FitnessSource" NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "body_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wearable_samples" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "userId" UUID NOT NULL,
    "type" "WearableSampleType" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "value" JSONB NOT NULL,
    "sourceDevice" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "conflict" BOOLEAN NOT NULL DEFAULT false,
    "conflictWorkoutId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wearable_samples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exercises_userId_idx" ON "exercises"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "exercises_userId_name_key" ON "exercises"("userId", "name");

-- CreateIndex
CREATE INDEX "workouts_userId_startedAt_idx" ON "workouts"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "workouts_programId_idx" ON "workouts"("programId");

-- CreateIndex
CREATE INDEX "workouts_deletedAt_idx" ON "workouts"("deletedAt");

-- CreateIndex
CREATE INDEX "workout_exercises_workoutId_sortOrder_idx" ON "workout_exercises"("workoutId", "sortOrder");

-- CreateIndex
CREATE INDEX "workout_exercises_exerciseId_idx" ON "workout_exercises"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "workout_sets_workoutExerciseId_setNumber_key" ON "workout_sets"("workoutExerciseId", "setNumber");

-- CreateIndex
CREATE INDEX "programs_userId_isActive_idx" ON "programs"("userId", "isActive");

-- CreateIndex
CREATE INDEX "program_workouts_programId_dayOffset_idx" ON "program_workouts"("programId", "dayOffset");

-- CreateIndex
CREATE INDEX "body_metrics_userId_date_idx" ON "body_metrics"("userId", "date");

-- CreateIndex
CREATE INDEX "wearable_samples_userId_type_startsAt_idx" ON "wearable_samples"("userId", "type", "startsAt");

-- CreateIndex
CREATE INDEX "wearable_samples_conflictWorkoutId_idx" ON "wearable_samples"("conflictWorkoutId");

-- CreateIndex
CREATE UNIQUE INDEX "wearable_samples_userId_dedupeKey_key" ON "wearable_samples"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "workouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- NO ACTION keeps an exercise that a workout still uses from being deleted, but the check has to wait for
-- the end of the transaction: deleting a user cascades to their custom exercises and to their workouts in
-- no guaranteed order, and an immediate check would fail if the exercise went first. Prisma has no syntax
-- for DEFERRABLE, so it is only expressed here.
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_workoutExerciseId_fkey" FOREIGN KEY ("workoutExerciseId") REFERENCES "workout_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_workouts" ADD CONSTRAINT "program_workouts_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "body_metrics" ADD CONSTRAINT "body_metrics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wearable_samples" ADD CONSTRAINT "wearable_samples_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wearable_samples" ADD CONSTRAINT "wearable_samples_conflictWorkoutId_fkey" FOREIGN KEY ("conflictWorkoutId") REFERENCES "workouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraints
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_completed_after_start" CHECK ("completedAt" IS NULL OR "completedAt" >= "startedAt");
ALTER TABLE "wearable_samples" ADD CONSTRAINT "wearable_samples_ends_after_start" CHECK ("endsAt" >= "startsAt");
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_rpe_range" CHECK ("rpe" IS NULL OR ("rpe" >= 1 AND "rpe" <= 10));

-- Seed: the read-only exercise library (userId NULL, isCustom false).
INSERT INTO "exercises" ("id", "userId", "name", "category", "muscleGroups", "isCustom", "updatedAt") VALUES
  (pg_catalog.gen_random_uuid(), NULL, 'Barbell Back Squat', 'strength', ARRAY['quads','glutes','hamstrings']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Front Squat', 'strength', ARRAY['quads','core']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Goblet Squat', 'strength', ARRAY['quads','glutes']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Leg Press', 'strength', ARRAY['quads','glutes']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Lunge', 'strength', ARRAY['quads','glutes','hamstrings']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Bulgarian Split Squat', 'strength', ARRAY['quads','glutes']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Conventional Deadlift', 'strength', ARRAY['back','glutes','hamstrings']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Romanian Deadlift', 'strength', ARRAY['hamstrings','glutes','back']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Hip Thrust', 'strength', ARRAY['glutes']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Leg Curl', 'strength', ARRAY['hamstrings']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Leg Extension', 'strength', ARRAY['quads']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Standing Calf Raise', 'strength', ARRAY['calves']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Bench Press', 'strength', ARRAY['chest','triceps','shoulders']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Incline Dumbbell Press', 'strength', ARRAY['chest','shoulders','triceps']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Push-Up', 'strength', ARRAY['chest','triceps','core']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Dumbbell Fly', 'strength', ARRAY['chest']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Overhead Press', 'strength', ARRAY['shoulders','triceps']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Lateral Raise', 'strength', ARRAY['shoulders']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Pull-Up', 'strength', ARRAY['back','biceps']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Lat Pulldown', 'strength', ARRAY['back','biceps']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Barbell Row', 'strength', ARRAY['back','biceps']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Seated Cable Row', 'strength', ARRAY['back','biceps']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Face Pull', 'strength', ARRAY['shoulders','back']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Barbell Curl', 'strength', ARRAY['biceps']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Hammer Curl', 'strength', ARRAY['biceps','forearms']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Triceps Pushdown', 'strength', ARRAY['triceps']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Dip', 'strength', ARRAY['triceps','chest']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Plank', 'strength', ARRAY['core']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Hanging Leg Raise', 'strength', ARRAY['core']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Russian Twist', 'strength', ARRAY['core']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Kettlebell Swing', 'strength', ARRAY['glutes','hamstrings','full_body']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Burpee', 'cardio', ARRAY['full_body']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Running', 'cardio', ARRAY['quads','hamstrings','calves']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Cycling', 'cardio', ARRAY['quads','glutes','calves']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Rowing Machine', 'cardio', ARRAY['back','quads','full_body']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Swimming', 'cardio', ARRAY['full_body']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Jump Rope', 'cardio', ARRAY['calves','full_body']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Stair Climber', 'cardio', ARRAY['quads','glutes','calves']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Hiking', 'cardio', ARRAY['quads','glutes','calves']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Elliptical', 'cardio', ARRAY['full_body']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Yoga Flow', 'flexibility', ARRAY['full_body']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Hamstring Stretch', 'flexibility', ARRAY['hamstrings']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Hip Flexor Stretch', 'flexibility', ARRAY['quads']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Foam Rolling', 'mobility', ARRAY['full_body']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Hip 90/90', 'mobility', ARRAY['glutes']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Thoracic Spine Rotation', 'mobility', ARRAY['back']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Pickleball', 'sports', ARRAY['full_body']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Basketball', 'sports', ARRAY['full_body']::TEXT[], false, CURRENT_TIMESTAMP),
  (pg_catalog.gen_random_uuid(), NULL, 'Soccer', 'sports', ARRAY['quads','hamstrings','calves']::TEXT[], false, CURRENT_TIMESTAMP);
