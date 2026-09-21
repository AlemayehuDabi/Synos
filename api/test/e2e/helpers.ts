import { randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { DevMailProvider } from '../../src/modules/mail/dev-mail.provider.js';
import type { MailMessage } from '../../src/modules/mail/mail.interface.js';

export type SentMail = MailMessage;

export async function createTestApp(): Promise<{ app: INestApplication; sentMails: SentMail[] }> {
  const sentMails: SentMail[] = [];
  vi.spyOn(DevMailProvider.prototype, 'send').mockImplementation(async (message: MailMessage) => {
    sentMails.push(message);
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('api/v1', {
    exclude: ['api/auth', 'api/auth/*path', 'healthz', 'healthz/ready'],
  });
  await app.init();
  return { app, sentMails };
}

export function extractUrl(text: string): string {
  const match = text.match(/https?:\/\/\S+/);
  if (!match) throw new Error(`No URL found in mail text: ${text}`);
  return match[0].replace(/^https?:\/\/[^/]+/, '');
}

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export interface TestUser {
  email: string;
  password: string;
  name: string;
  token: string;
  userId: string;
}

export async function signUpAndVerify(
  app: INestApplication,
  sentMails: SentMail[],
  overrides: { email?: string; password?: string; name?: string } = {},
): Promise<TestUser> {
  const email = overrides.email ?? uniqueEmail();
  const password = overrides.password ?? 'correcthorsebattery';
  const name = overrides.name ?? 'Test User';

  await request(app.getHttpServer()).post('/api/auth/sign-up/email').send({ email, password, name }).expect(200);

  const verificationMail = sentMails.find((m) => m.to === email && m.subject.includes('Verify'));
  if (!verificationMail) throw new Error('Verification email was not sent');
  const verifyPath = extractUrl(verificationMail.text);

  // Better Auth returns 200 JSON when hit with no callbackURL, or 302 redirecting
  // to it when one is present (as it is here) - both mean verification succeeded.
  const verifyRes = await request(app.getHttpServer()).get(verifyPath);
  if (![200, 302].includes(verifyRes.status)) {
    throw new Error(`Email verification failed with status ${verifyRes.status}: ${verifyRes.text}`);
  }

  const signInResponse = await request(app.getHttpServer())
    .post('/api/auth/sign-in/email')
    .send({ email, password })
    .expect(200);

  return {
    email,
    password,
    name,
    token: signInResponse.body.token as string,
    userId: signInResponse.body.user.id as string,
  };
}

export async function waitForExportReady(
  app: INestApplication,
  token: string,
  jobId: string,
  attempts = 50,
) {
  for (let i = 0; i < attempts; i += 1) {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/me/export/${jobId}`)
      .set(bearer(token));
    if (res.headers['content-disposition']) {
      return res;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('export job did not become ready in time');
}
