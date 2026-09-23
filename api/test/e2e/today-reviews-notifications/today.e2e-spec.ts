import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { localDateInTimezone } from '../../../src/common/time/timezone.js';
import { SandboxModule } from '../../sandbox/sandbox.module.js';
import { sandboxState } from '../../sandbox/sandbox-state.js';
import { SandboxTodayModule } from '../../sandbox/today-contributors.js';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser, updateSettings } from '../helpers.js';
import { emitWorkoutCompleted } from '../signal-engine/support.js';
import { SignalEngineFacade } from '../../../src/signal-engine/signal-engine.facade.js';

describe('Today (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let facade: SignalEngineFacade;
  let userA: TestUser;
  let userB: TestUser;

  const today = (user: TestUser, query: Record<string, string> = {}) =>
    request(app.getHttpServer()).get('/api/v1/today').query(query).set(bearer(user.token));

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp([SandboxModule, SandboxTodayModule]));
    facade = app.get(SignalEngineFacade);
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => sandboxState.reset());
  afterEach(() => vi.restoreAllMocks());

  it('requires authentication', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/today').expect(401);
    expect(res.body).toMatchObject({ statusCode: 401 });
  });

  it('answers with a section per registered domain, in a fixed order, whatever each one does', async () => {
    const started = Date.now();
    const res = await today(userA).expect(200);
    const elapsed = Date.now() - started;

    expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.timezone).toBe('UTC');
    expect(res.body.inbox).toEqual({ pending: 0 });
    expect(res.body.sections.map((section: { domain: string }) => `${section.domain}:${section.status}`)).toEqual([
      'calendar:ok', // the real Calendar module's own @TodayContributor('calendar'); this user has no events
      'tasks:ok', // the real Tasks module's own @TodayContributor('tasks'); this user has no tasks - see the Tasks e2e suite for real behavior
      'habits:error',
      'fitness:ok', // the sandbox fixture that records the context it was handed
      'finances:timeout',
      'meals:error',
    ]);
    const calendar = res.body.sections.find((section: { domain: string }) => section.domain === 'calendar');
    expect(calendar).toEqual({ domain: 'calendar', status: 'ok', summary: { count: 0 }, items: [] });
    const tasks = res.body.sections.find((section: { domain: string }) => section.domain === 'tasks');
    expect(tasks).toEqual({ domain: 'tasks', status: 'ok', summary: { dueToday: 0, overdue: 0, scheduledToday: 0 }, items: [] });

    // A failed or slow domain carries nothing but its name and status.
    const byDomain = Object.fromEntries(res.body.sections.map((section: { domain: string }) => [section.domain, section]));
    expect(byDomain.habits).toEqual({ domain: 'habits', status: 'error' });
    expect(byDomain.finances).toEqual({ domain: 'finances', status: 'timeout' });
    expect(byDomain.meals).toEqual({ domain: 'meals', status: 'error' });

    // The finances contributor sleeps for 5s: the endpoint gave up on it after the 500ms budget.
    expect(elapsed).toBeLessThan(3_000);
  });

  it('never puts what a failing contributor said in the response or the logs', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const res = await today(userA).expect(200);
    expect(JSON.stringify(res.body)).not.toContain('SECRET-HABIT-PAYLOAD');

    const logged = [...warn.mock.calls, ...error.mock.calls].map((call) => String(call[0]));
    expect(logged.some((line) => line.includes('"habits"') && line.includes(userA.userId))).toBe(true);
    expect(logged.some((line) => line.includes('"finances"') && line.includes('timed out'))).toBe(true);
    expect(logged.join('\n')).not.toContain('SECRET-HABIT-PAYLOAD');
  });

  it('defaults the date to today on the user\'s own calendar and tells contributors the timezone', async () => {
    await updateSettings(app, userA.token, { timezone: 'Pacific/Kiritimati' }); // UTC+14
    await updateSettings(app, userB.token, { timezone: 'Pacific/Pago_Pago' }); // UTC-11

    const seen = async (user: TestUser, timezone: string) => {
      const before = localDateInTimezone(new Date(), timezone);
      const res = await today(user).expect(200);
      const after = localDateInTimezone(new Date(), timezone);
      expect(res.body.timezone).toBe(timezone);
      expect([before, after]).toContain(res.body.date);
      expect(sandboxState.todayContexts.at(-1)).toEqual({ userId: user.userId, date: res.body.date, timezone });
      return res.body.date as string;
    };

    const dateA = await seen(userA, 'Pacific/Kiritimati');
    const dateB = await seen(userB, 'Pacific/Pago_Pago');
    expect(dateA).not.toBe(dateB); // 25 hours apart: never the same calendar day
  });

  it('shows the requested date instead when one is given', async () => {
    const res = await today(userA, { date: '2026-02-14' }).expect(200);
    expect(res.body.date).toBe('2026-02-14');
    expect(sandboxState.todayContexts.at(-1)).toMatchObject({ date: '2026-02-14', timezone: 'Pacific/Kiritimati' });

    await today(userA, { date: '2028-02-29' }).expect(200);
  });

  it.each(['2026-02-30', '2026-13-01', '2026-9-1', '20260921', 'today', '2026-09-21T10:00:00Z', ''])(
    'rejects the malformed date "%s" with a standard error',
    async (date) => {
      const res = await today(userA, { date }).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'BAD_REQUEST' });
      expect(String(res.body.message)).toContain('date');
    },
  );

  it('rejects query parameters it does not know', async () => {
    await today(userA, { when: 'tomorrow' }).expect(400);
  });

  it('reports how many suggestions are waiting in the inbox, per user', async () => {
    await emitWorkoutCompleted(facade, userA.userId);
    await emitWorkoutCompleted(facade, userA.userId);

    expect((await today(userA).expect(200)).body.inbox).toEqual({ pending: 2 });
    expect((await today(userB).expect(200)).body.inbox).toEqual({ pending: 0 });
  });
});
