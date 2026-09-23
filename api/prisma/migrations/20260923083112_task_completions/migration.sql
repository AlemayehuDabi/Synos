-- CreateTable
CREATE TABLE "task_completions" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "taskId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "recurringGroupId" UUID,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimatedMinutes" INTEGER,
    "actualMinutes" INTEGER,

    CONSTRAINT "task_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_completions_userId_completedAt_idx" ON "task_completions"("userId", "completedAt");

-- AddForeignKey
ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
