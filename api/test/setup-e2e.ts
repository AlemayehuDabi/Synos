import 'dotenv/config';

if (!process.env.DATABASE_URL_TEST) {
  throw new Error('DATABASE_URL_TEST must be set to run the e2e suite (see .env.example)');
}

// Every import in the e2e specs (PrismaService, lib/auth.ts) reads DATABASE_URL
// straight off process.env, so this must run before those modules are imported.
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.NODE_ENV = 'test';

// Small values so specs that need a contributor to time out, or a push to retry, stay fast.
// Assigned rather than defaulted: whatever .env says, the suite must behave the same everywhere.
process.env.TODAY_CONTRIBUTOR_TIMEOUT_MS = '500';
process.env.REVIEW_CONTRIBUTOR_TIMEOUT_MS = '500';
process.env.PUSH_RETRY_BASE_DELAY_MS = '10';
process.env.PUSH_MAX_ATTEMPTS = '3';
process.env.NOTIFICATION_RETENTION_DAYS = '90';
