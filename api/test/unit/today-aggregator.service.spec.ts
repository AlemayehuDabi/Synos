import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TodayAggregatorService } from '../../src/today/today-aggregator.service.js';
import type { TodayContribution } from '../../src/today/today-contributor.js';

const context = { userId: 'user-1', date: '2026-09-21', timezone: 'UTC' };
const ok = (summary: Record<string, unknown> = {}): TodayContribution => ({ summary, items: [] });
const delayed = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

function build(contributors: Record<string, () => Promise<unknown>>, timeoutMs = 1500) {
  const registry = {
    list: () => Object.entries(contributors).map(([domain, collect]) => ({ domain, contributor: { collect } })),
  };
  const config = { get: (_key: string, fallback: number) => (_key === 'TODAY_CONTRIBUTOR_TIMEOUT_MS' ? timeoutMs : fallback) };
  return new TodayAggregatorService(registry as never, config as never);
}

describe('TodayAggregatorService', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns one ok section per contributor, in registry order, with their data', async () => {
    const aggregator = build({
      tasks: async () => ({ summary: { open: 2 }, items: [{ id: 't1', title: 'Write', done: false }] }),
      habits: async () => ok({ streak: 5 }),
    });
    expect(await aggregator.collect(context)).toEqual([
      { domain: 'tasks', status: 'ok', summary: { open: 2 }, items: [{ id: 't1', title: 'Write', done: false }] },
      { domain: 'habits', status: 'ok', summary: { streak: 5 }, items: [] },
    ]);
  });

  it('hands every contributor the user, the date and the timezone', async () => {
    const collect = vi.fn().mockResolvedValue(ok());
    await build({ tasks: collect }).collect(context);
    expect(collect).toHaveBeenCalledWith(context);
  });

  it('marks a throwing contributor as error and still answers for the others', async () => {
    const aggregator = build({
      tasks: async () => ok({ open: 1 }),
      habits: async () => {
        throw new Error('SECRET-PAYLOAD');
      },
    });
    expect(await aggregator.collect(context)).toEqual([
      { domain: 'tasks', status: 'ok', summary: { open: 1 }, items: [] },
      { domain: 'habits', status: 'error' },
    ]);
  });

  it('marks a contributor that answers in the wrong shape as error', async () => {
    const aggregator = build({
      tasks: async () => ({ summary: 'nope', items: 'nope' }),
      habits: async () => ({ summary: {}, items: [{ id: 'no-title' }] }),
      meals: async () => null,
    });
    const sections = await aggregator.collect(context);
    expect(sections.map((section) => section.status)).toEqual(['error', 'error', 'error']);
  });

  it('marks a slow contributor as timeout without waiting for it', async () => {
    vi.useFakeTimers();
    const aggregator = build(
      {
        tasks: async () => ok(),
        finances: () => delayed(60_000, ok()),
      },
      1500,
    );
    const pending = aggregator.collect(context);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await pending).toEqual([
      { domain: 'tasks', status: 'ok', summary: {}, items: [] },
      { domain: 'finances', status: 'timeout' },
    ]);
  });

  it('asks every contributor at once, so the slowest one sets the pace', async () => {
    vi.useFakeTimers();
    const aggregator = build(
      { tasks: () => delayed(300, ok()), habits: () => delayed(300, ok()), meals: () => delayed(300, ok()) },
      1500,
    );
    let settled = false;
    const pending = aggregator.collect(context).then((sections) => {
      settled = true;
      return sections;
    });
    await vi.advanceTimersByTimeAsync(300);
    expect(settled).toBe(true);
    expect((await pending).every((section) => section.status === 'ok')).toBe(true);
  });

  it('logs ids and domains only, never what the contributor said', async () => {
    const aggregator = build({
      habits: async () => {
        throw new Error('SECRET-PAYLOAD');
      },
      tasks: async () => ({ summary: 'SECRET-PAYLOAD', items: [] }),
    });
    await aggregator.collect(context);

    const logged = warn.mock.calls.map((call) => String(call[0]));
    expect(logged).toHaveLength(2);
    expect(logged[0]).toContain('"habits"');
    expect(logged[0]).toContain('user-1');
    expect(logged.join('\n')).not.toContain('SECRET-PAYLOAD');
  });

  it('answers with no sections when nothing is registered', async () => {
    expect(await build({}).collect(context)).toEqual([]);
  });
});
