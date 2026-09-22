-- CreateEnum
CREATE TYPE "CalendarEventSource" AS ENUM ('manual', 'suggestion', 'auto', 'sync');

-- CreateEnum
CREATE TYPE "CalendarExceptionKind" AS ENUM ('cancelled', 'modified');

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "location" TEXT,
    "color" TEXT,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "rrule" TEXT,
    "seriesUntil" TIMESTAMP(3),
    "source" "CalendarEventSource" NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_event_exceptions" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "eventId" UUID NOT NULL,
    "originalStart" TIMESTAMP(3) NOT NULL,
    "kind" "CalendarExceptionKind" NOT NULL,
    "title" TEXT,
    "notes" TEXT,
    "location" TEXT,
    "color" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_event_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_events_userId_startsAt_idx" ON "calendar_events"("userId", "startsAt");

-- CreateIndex
CREATE INDEX "calendar_events_userId_seriesUntil_idx" ON "calendar_events"("userId", "seriesUntil");

-- CreateIndex
CREATE INDEX "calendar_events_deletedAt_idx" ON "calendar_events"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_event_exceptions_eventId_originalStart_key" ON "calendar_event_exceptions"("eventId", "originalStart");

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_exceptions" ADD CONSTRAINT "calendar_event_exceptions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity checks Prisma cannot express: an event ends after it starts, and a
-- modified occurrence that overrides both times ends after it starts.
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_ends_after_starts" CHECK ("endsAt" > "startsAt");

ALTER TABLE "calendar_event_exceptions" ADD CONSTRAINT "calendar_event_exceptions_ends_after_starts" CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt");
