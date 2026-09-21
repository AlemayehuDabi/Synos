-- Signals are an append-only log: once written, only the processing bookkeeping
-- columns (processedAt, attempts, nextAttemptAt, lastError, updatedAt) may change.
-- Prisma cannot express this, so it is enforced in the database.
CREATE OR REPLACE FUNCTION signals_reject_immutable_updates() RETURNS trigger AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."userId" IS DISTINCT FROM OLD."userId"
     OR NEW."type" IS DISTINCT FROM OLD."type"
     OR NEW."sourceDomain" IS DISTINCT FROM OLD."sourceDomain"
     OR NEW."schemaVersion" IS DISTINCT FROM OLD."schemaVersion"
     OR NEW."payload" IS DISTINCT FROM OLD."payload"
     OR NEW."subjectType" IS DISTINCT FROM OLD."subjectType"
     OR NEW."subjectId" IS DISTINCT FROM OLD."subjectId"
     OR NEW."dedupeKey" IS DISTINCT FROM OLD."dedupeKey"
     OR NEW."occurredAt" IS DISTINCT FROM OLD."occurredAt"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'signals is append-only: only processedAt, attempts, nextAttemptAt, lastError and updatedAt may change';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER signals_append_only
BEFORE UPDATE ON "signals"
FOR EACH ROW EXECUTE FUNCTION signals_reject_immutable_updates();
