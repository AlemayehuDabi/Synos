import 'dotenv/config';

if (!process.env.DATABASE_URL_TEST) {
  throw new Error('DATABASE_URL_TEST must be set to run the e2e suite (see .env.example)');
}

// Every import in the e2e specs (PrismaService, lib/auth.ts) reads DATABASE_URL
// straight off process.env, so this must run before those modules are imported.
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.NODE_ENV = 'test';
