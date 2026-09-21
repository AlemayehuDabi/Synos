import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { DevMailProvider } from '../modules/mail/dev-mail.provider.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const mailProvider = new DevMailProvider();

const trustedOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const appleEnabled = Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET);

export const auth = betterAuth({
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  advanced: {
    database: {
      generateId: 'uuid',
      // Related data is fetched via separate queries by default. Enabling joins lets
      // the Prisma adapter use native SQL joins instead, which is supported here.
      joins: true,
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await mailProvider.send({
        to: user.email,
        subject: 'Reset your Synos password',
        text: `Reset your password: ${url}`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await mailProvider.send({
        to: user.email,
        subject: 'Verify your Synos email',
        text: `Verify your email: ${url}`,
      });
    },
  },
  databaseHooks: {},
  socialProviders: {
    ...(googleEnabled
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          },
        }
      : {}),
    ...(appleEnabled
      ? {
          apple: {
            clientId: process.env.APPLE_CLIENT_ID!,
            clientSecret: process.env.APPLE_CLIENT_SECRET!,
            appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER,
          },
        }
      : {}),
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 60, max: 5 },
      '/request-password-reset': { window: 60, max: 3 },
    },
  },
  plugins: [bearer()],
});

export type Auth = typeof auth;
