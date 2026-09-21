import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewCollectorService } from '../../src/reviews/review-collector.service.js';
import type { ReviewContext } from '../../src/reviews/review-contributor.js';

const context: ReviewContext = {
  userId: 'user-1',
  type: 'weekly',
  periodStart: new Date('2026-09-14T00:00:00Z'),
  periodEnd: new Date('2026-09-21T00:00:00Z'),
  startDate: '2026-09-14',
  endDate: '2026-09-20',
  timezone: 'UTC',
};

function build(contributors: Record<string, () => Promise<unknown>>, counts: Record<string, number> = {}) {
  const registry = {
    list: () => Object.entries(contributors).map(([domain, collect]) => ({ domain, contributor: { collect } })),
  };
  const signalEngine = { activityCounts: vi.fn().mockResolvedValue(counts) };
  const config = { get: (key: string, fallback: number) => (key === 'REVIEW_CONTRIBUTOR_TIMEOUT_MS' ? 25 : fallback) };
  return { collector: new ReviewCollectorService(registry as never, signalEngine as never, config as never), signalEngine };
}

describe('ReviewCollectorService', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('builds one section per domain and the cross-domain section last', async () => {
    const { collector, signalEngine } = build(
      { tasks: async () => ({ metrics: { completed: 3 }, highlights: ['Completed 3 tasks'] }) },
      { suggestion_approved: 2 },
    );
    const { sections, hasActivity } = await collector.collect(context);

    expect(sections.map((section) => section.domain)).toEqual(['tasks', 'cross_domain']);
    expect(sections[0]).toEqual({
      domain: 'tasks',
      status: 'ok',
      metrics: { completed: 3 },
      highlights: ['Completed 3 tasks'],
    });
    expect(sections[1].metrics).toMatchObject({ suggestionsApproved: 2 });
    expect(hasActivity).toBe(true);
    expect(signalEngine.activityCounts).toHaveBeenCalledWith('user-1', context.periodStart, context.periodEnd);
  });

  it('still has a cross-domain section when no domain is registered', async () => {
    const { collector } = build({});
    const { sections, hasActivity } = await collector.collect(context);
    expect(sections.map((section) => section.domain)).toEqual(['cross_domain']);
    expect(hasActivity).toBe(false);
  });

  it('has no activity when everything is zero or empty', async () => {
    const { collector } = build({ tasks: async () => ({ metrics: { completed: 0, note: 'x' }, highlights: [] }) });
    expect((await collector.collect(context)).hasActivity).toBe(false);
  });

  it('is active from a domain alone, from a highlight alone, or from the engine alone', async () => {
    expect((await build({ a: async () => ({ metrics: { n: 1 }, highlights: [] }) }).collector.collect(context)).hasActivity).toBe(true);
    expect((await build({ a: async () => ({ metrics: {}, highlights: ['did a thing'] }) }).collector.collect(context)).hasActivity).toBe(true);
    expect((await build({}, { manual_override: 1 }).collector.collect(context)).hasActivity).toBe(true);
  });

  it('lets a domain say explicitly whether it was active', async () => {
    const quiet = build({ a: async () => ({ metrics: { n: 50 }, highlights: ['lots'], hasActivity: false }) });
    expect((await quiet.collector.collect(context)).hasActivity).toBe(false);

    const busy = build({ a: async () => ({ metrics: { n: 0 }, highlights: [], hasActivity: true }) });
    expect((await busy.collector.collect(context)).hasActivity).toBe(true);
  });

  it('turns a throwing, malformed or slow domain into an error/timeout section that is never activity', async () => {
    const { collector } = build({
      calendar: async () => {
        throw new Error('SECRET-PAYLOAD');
      },
      tasks: async () => ({ metrics: 'nope', highlights: 'nope' }),
      finances: () => new Promise<never>(() => undefined),
    });
    const { sections, hasActivity } = await collector.collect(context);

    expect(sections.slice(0, 3)).toEqual([
      { domain: 'calendar', status: 'error' },
      { domain: 'tasks', status: 'error' },
      { domain: 'finances', status: 'timeout' },
    ]);
    expect(sections[3].domain).toBe('cross_domain');
    expect(hasActivity).toBe(false);
    expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).not.toContain('SECRET-PAYLOAD');
  });

  it('keeps the healthy sections when another domain fails', async () => {
    const { collector } = build({
      tasks: async () => ({ metrics: { completed: 1 }, highlights: [] }),
      habits: async () => {
        throw new Error('down');
      },
    });
    const { sections, hasActivity } = await collector.collect(context);
    expect(sections.map((section) => `${section.domain}:${section.status}`)).toEqual([
      'tasks:ok',
      'habits:error',
      'cross_domain:ok',
    ]);
    expect(hasActivity).toBe(true);
  });
});
