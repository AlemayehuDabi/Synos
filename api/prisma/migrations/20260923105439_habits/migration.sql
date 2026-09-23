-- CreateEnum
CREATE TYPE "HabitType" AS ENUM ('build', 'break');

-- CreateEnum
CREATE TYPE "HabitSchedule" AS ENUM ('daily', 'weekly', 'specificDays', 'timesPerWeek', 'timesPerMonth');

-- CreateEnum
CREATE TYPE "HabitSource" AS ENUM ('manual', 'suggestion', 'auto');

-- CreateEnum
CREATE TYPE "HabitEntryStatus" AS ENUM ('done', 'slipped');

-- CreateTable
CREATE TABLE "habits" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "type" "HabitType" NOT NULL,
    "schedule" "HabitSchedule" NOT NULL,
    "scheduleDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "targetPerPeriod" INTEGER,
    "timezone" TEXT NOT NULL,
    "color" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "source" "HabitSource" NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "habits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habit_entries" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "habitId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "HabitEntryStatus" NOT NULL,
    "note" TEXT,
    "source" "HabitSource" NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "habit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "habits_userId_isArchived_idx" ON "habits"("userId", "isArchived");

-- CreateIndex
CREATE INDEX "habits_deletedAt_idx" ON "habits"("deletedAt");

-- CreateIndex
CREATE INDEX "habit_entries_userId_date_idx" ON "habit_entries"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "habit_entries_habitId_date_key" ON "habit_entries"("habitId", "date");

-- AddForeignKey
ALTER TABLE "habits" ADD CONSTRAINT "habits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habit_entries" ADD CONSTRAINT "habit_entries_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "habits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habit_entries" ADD CONSTRAINT "habit_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
