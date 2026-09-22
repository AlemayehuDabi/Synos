import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarBlockAggregatorService } from '../../src/calendar/calendar-block-aggregator.service.js';
import type { Block } from '../../src/calendar/calendar-block-contributor.js';

const context = { userId: 'user-1', from: new Date('2026-09-22T00:00:00Z'), to: new Date('2026-09-23T00:00:00Z'), timezone: 'UTC' };
const block = (overrides: Partial<Block> = {}): Block => ({
  id: 'b1',
  domain: 'tasks',
  title: 'Focus block',
  startsAt: new Date('2026-09-22T09:00:00Z'),
  endsAt: new Date('2026-09-22T10:00:00Z'),
  allDay: false,
  busy: true,
  ...overrides,
});

function build(contributors: Record<string, () => Promise<unknown>>, timeoutMs = 1500) {
  const registry = { list: () => Object.entries(contributors).map(([domain, collect]) => ({ domain, contributor: { collect } })) };
  const config = { get: (key: string, fallback: number) => (key === 'CALENDAR_CONTRIBUTOR_TIMEOUT_MS' ? timeoutMs : fallback) };
  return new CalendarBlockAggregatorService(registry as never, config as never);
}

describe('CalendarBlockAggregatorService', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns one ok section per contributor, in registry order, with validated blocks', async () => {
    const aggregator = build({
      tasks: async () => [block({ id: 'b1', title: 'Deep work' })],
      habits: async () => [],
    });
    expect(await aggregator.collect(context)).toEqual([
      { domain: 'tasks', status: 'ok', blocks: [block({ id: 'b1', title: 'Deep work' })] },
      { domain: 'habits', status: 'ok', blocks: [] },
    ]);
  });

  it('hands every contributor the user, range and timezone', async () => {
    const collect = vi.fn().mockResolvedValue([]);
    await build({ tasks: collect }).collect(context);
    expect(collect).toHaveBeenCalledWith(context);
  });

  it('normalizes ISO-string block times to Date instances', async () => {
    const aggregator = build({
      tasks: async () => [{ ...block(), startsAt: '2026-09-22T09:00:00Z' as never, endsAt: '2026-09-22T10:00:00Z' as never }],
    });
    const [section] = await aggregator.collect(context);
    expect(section.status).toBe('ok');
    if (section.status === 'ok') {
      expect(section.blocks[0].startsAt).toBeInstanceOf(Date);
      expect(section.blocks[0].endsAt).toBeInstanceOf(Date);
    }
  });

  it('marks a throwing contributor as error and still answers for the others', async () => {
    const aggregator = build({
      tasks: async () => [block()],
      habits: async () => {
        throw new Error('SECRET-BLOCK-PAYLOAD');
      },
    });
    expect(await aggregator.collect(context)).toEqual([
      { domain: 'tasks', status: 'ok', blocks: [block()] },
      { domain: 'habits', status: 'error' },
    ]);
  });

  it('marks a contributor that answers in the wrong shape as error', async () => {
    const aggregator = build({
      tasks: async () => 'not an array',
      habits: async () => [{ id: 'no-title' }],
      meals: async () => [{ ...block(), busy: 'yes' }],
    });
    const sections = await aggregator.collect(context);
    expect(sections.map((section) => section.status)).toEqual(['error', 'error', 'error']);
  });

  it('marks a slow contributor as timeout without waiting for it', async () => {
    vi.useFakeTimers();
    const aggregator = build(
      { tasks: async () => [block()], finances: () => new Promise<Block[]>((resolve) => setTimeout(() => resolve([]), 60_000)) },
      1500,
    );
    const pending = aggregator.collect(context);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await pending).toEqual([
      { domain: 'tasks', status: 'ok', blocks: [block()] },
      { domain: 'finances', status: 'timeout' },
    ]);
    vi.useRealTimers();
  });

  it('logs ids and domains only, never what the contributor returned or threw', async () => {
    const aggregator = build({
      habits: async () => {
        throw new Error('SECRET-BLOCK-PAYLOAD');
      },
      tasks: async () => [{ ...block(), title: 'SECRET-BLOCK-PAYLOAD' }],
    });
    await aggregator.collect(context);

    const logged = warn.mock.calls.map((call) => String(call[0]));
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('"habits"');
    expect(logged[0]).toContain('user-1');
    expect(logged.join('\n')).not.toContain('SECRET-BLOCK-PAYLOAD');
  });

  it('answers with no sections when nothing is registered', async () => {
    expect(await build({}).collect(context)).toEqual([]);
  });
});
