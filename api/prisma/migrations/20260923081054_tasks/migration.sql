-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('open', 'completed', 'skipped');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('none', 'low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "TaskSource" AS ENUM ('manual', 'suggestion', 'auto', 'sync');

-- CreateEnum
CREATE TYPE "TaskExceptionKind" AS ENUM ('skipped', 'modified');

-- CreateEnum
CREATE TYPE "SubtaskStatus" AS ENUM ('open', 'completed');

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "priority" "TaskPriority" NOT NULL DEFAULT 'none',
    "dueAt" TIMESTAMP(3),
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "timezone" TEXT,
    "estimatedMinutes" INTEGER,
    "actualMinutes" INTEGER,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "rrule" TEXT,
    "seriesUntil" TIMESTAMP(3),
    "recurringGroupId" UUID,
    "source" "TaskSource" NOT NULL DEFAULT 'manual',
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_exceptions" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "taskId" UUID NOT NULL,
    "originalDueAt" TIMESTAMP(3) NOT NULL,
    "kind" "TaskExceptionKind" NOT NULL,
    "title" TEXT,
    "notes" TEXT,
    "priority" "TaskPriority",
    "dueAt" TIMESTAMP(3),
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "estimatedMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subtasks" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "taskId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "SubtaskStatus" NOT NULL DEFAULT 'open',
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "subtasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_userId_status_dueAt_idx" ON "tasks"("userId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "tasks_userId_recurringGroupId_idx" ON "tasks"("userId", "recurringGroupId");

-- CreateIndex
CREATE INDEX "tasks_userId_scheduledStart_idx" ON "tasks"("userId", "scheduledStart");

-- CreateIndex
CREATE INDEX "tasks_deletedAt_idx" ON "tasks"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "task_exceptions_taskId_originalDueAt_key" ON "task_exceptions"("taskId", "originalDueAt");

-- CreateIndex
CREATE INDEX "subtasks_taskId_sortOrder_idx" ON "subtasks"("taskId", "sortOrder");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_exceptions" ADD CONSTRAINT "task_exceptions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity checks Prisma cannot express: a scheduled block ends after it starts,
-- on both the task itself and a modified occurrence's override.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_scheduled_end_after_start" CHECK ("scheduledStart" IS NULL OR "scheduledEnd" IS NULL OR "scheduledEnd" > "scheduledStart");

ALTER TABLE "task_exceptions" ADD CONSTRAINT "task_exceptions_scheduled_end_after_start" CHECK ("scheduledStart" IS NULL OR "scheduledEnd" IS NULL OR "scheduledEnd" > "scheduledStart");
