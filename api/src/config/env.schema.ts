import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.url(),
  DATABASE_URL_TEST: z.url().optional(),

  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.url(),

  CORS_ORIGINS: z.string().min(1, 'CORS_ORIGINS must list at least one allowed origin'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_CLIENT_SECRET: z.string().optional(),
  APPLE_APP_BUNDLE_IDENTIFIER: z.string().optional(),

  MAIL_PROVIDER: z.enum(['dev']).default('dev'),
  MAIL_FROM_ADDRESS: z.email(),

  EXPORT_STORAGE_DIR: z.string().min(1),

  MAX_PENDING_PER_CONNECTION: z.coerce.number().int().positive().default(20),
  SIGNAL_RETENTION_DAYS: z.coerce.number().int().positive().default(180),
  SUGGESTION_RETENTION_DAYS: z.coerce.number().int().positive().default(180),
  ACTIVITY_RETENTION_DAYS: z.coerce.number().int().positive().default(730),
  UNDO_WINDOW_DAYS: z.coerce.number().int().positive().default(30),

  TODAY_CONTRIBUTOR_TIMEOUT_MS: z.coerce.number().int().positive().default(1500),

  REVIEW_CONTRIBUTOR_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  REVIEW_GENERATION_BATCH_SIZE: z.coerce.number().int().positive().max(1000).default(100),

  NOTIFICATION_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  INBOX_PUSH_MIN_INTERVAL_SECONDS: z.coerce.number().int().nonnegative().default(60),
  PUSH_PROVIDER: z.enum(['dev']).default('dev'),
  PUSH_MAX_ATTEMPTS: z.coerce.number().int().positive().max(10).default(3),
  PUSH_RETRY_BASE_DELAY_MS: z.coerce.number().int().nonnegative().default(1000),

  CALENDAR_CONTRIBUTOR_TIMEOUT_MS: z.coerce.number().int().positive().default(1500),
  CALENDAR_MAX_OCCURRENCES_PER_QUERY: z.coerce.number().int().positive().max(50_000).default(2000),
  CALENDAR_TOMBSTONE_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
