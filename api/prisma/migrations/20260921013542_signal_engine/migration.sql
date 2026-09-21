-- CreateEnum
CREATE TYPE "SignalDomain" AS ENUM ('calendar', 'tasks', 'habits', 'fitness', 'finances', 'meals', 'system');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('pending', 'approved', 'dismissed', 'superseded', 'expired', 'failed', 'auto_applied', 'reverted');

-- CreateEnum
CREATE TYPE "ConnectionMode" AS ENUM ('off', 'suggest', 'auto');

-- CreateEnum
CREATE TYPE "ResolvedBy" AS ENUM ('user', 'system');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('suggestion_created', 'suggestion_edited', 'suggestion_approved', 'suggestion_dismissed', 'auto_applied', 'superseded', 'expired', 'reverted', 'manual_override', 'mode_changed');

-- AlterTable
ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- AlterTable
ALTER TABLE "data_export_jobs" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- AlterTable
ALTER TABLE "devices" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- AlterTable
ALTER TABLE "idempotency_keys" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- AlterTable
ALTER TABLE "privacy_settings" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- AlterTable
ALTER TABLE "session" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- AlterTable
ALTER TABLE "user" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- AlterTable
ALTER TABLE "user_settings" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- AlterTable
ALTER TABLE "verification" ALTER COLUMN "id" SET DEFAULT pg_catalog.gen_random_uuid();

-- CreateTable
CREATE TABLE "signals" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "sourceDomain" "SignalDomain" NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "dedupeKey" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suggestions" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "userId" UUID NOT NULL,
    "signalId" UUID,
    "connectionId" TEXT NOT NULL,
    "targetDomain" "SignalDomain" NOT NULL,
    "actionType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "originalParams" JSONB,
    "targetKey" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'pending',
    "failureNote" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" "ResolvedBy",
    "supersededReason" TEXT,
    "revertData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection_settings" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "userId" UUID NOT NULL,
    "connectionId" TEXT NOT NULL,
    "mode" "ConnectionMode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connection_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "userId" UUID NOT NULL,
    "kind" "ActivityKind" NOT NULL,
    "suggestionId" UUID,
    "signalId" UUID,
    "connectionId" TEXT,
    "targetDomain" "SignalDomain",
    "entityRef" JSONB,
    "before" JSONB,
    "after" JSONB,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signals_userId_occurredAt_idx" ON "signals"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "signals_userId_type_occurredAt_idx" ON "signals"("userId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "signals_processedAt_nextAttemptAt_idx" ON "signals"("processedAt", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "signals_userId_dedupeKey_key" ON "signals"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "suggestions_userId_status_createdAt_idx" ON "suggestions"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "suggestions_userId_targetKey_status_idx" ON "suggestions"("userId", "targetKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "suggestions_userId_connectionId_dedupeKey_key" ON "suggestions"("userId", "connectionId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "connection_settings_userId_connectionId_key" ON "connection_settings"("userId", "connectionId");

-- CreateIndex
CREATE INDEX "activity_logs_userId_createdAt_idx" ON "activity_logs"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "signals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_settings" ADD CONSTRAINT "connection_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "suggestions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "signals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
