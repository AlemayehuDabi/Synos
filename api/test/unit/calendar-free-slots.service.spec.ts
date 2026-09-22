import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CalendarFreeSlotsService } from '../../src/calendar/calendar-free-slots.service.js';
import type { CalendarEvent } from '../../src/generated/prisma/client.js';

let counter = 0;
function calendarEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  counter += 1;
  return {
    id: `evt-${counter}`,
    userId: 'user-1',
    title: 'Busy',
    notes: null,
    location: null,
    color: null,
    allDay: false,
    startsAt: new Date('2026-09-22T09:00:00Z'),
    endsAt: new Date('2026-09-22T10:00:00Z'),
    timezone: 'UTC',
    rrule: null,
    seriesUntil: null,
    source: 'manual',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function build(events: CalendarEvent[], blockSections: unknown[] = []) {
  const prisma = {
    calendarEvent: { findMany: vi.fn().mockResolvedValue(events) },
    calendarEventException: { findMany: vi.fn().mockResolvedValue([]) },
    userSettings: { findUnique: vi.fn().mockResolvedValue({ timezone: 'UTC' }) },
  };
  const aggregator = { collect: vi.fn().mockResolvedValue(blockSections) };
  const config = { get: (_key: string, fallback: number) => fallback };
  return new CalendarFreeSlotsService(prisma as never, aggregator as never, config as never);
}

const DAY = { from: '2026-09-22', to: '2026-09-22' };

describe('CalendarFreeSlotsService', () => {
  it('is the whole range when nothing is busy', async () => {
    const service = build([]);
    const slots = await service.freeSlots('user-1', DAY.from, DAY.to, 60, {});
    expect(slots).toEqual([{ startsAt: '2026-09-22T00:00:00.000Z', endsAt: '2026-09-23T00:00:00.000Z' }]);
  });

  it('splits around one busy event into a before and an after slot', async () => {
    const service = build([calendarEvent({ startsAt: new Date('2026-09-22T09:00:00Z'), endsAt: new Date('2026-09-22T10:00:00Z') })]);
    const slots = await service.freeSlots('user-1', DAY.from, DAY.to, 30, {});
    expect(slots).toEqual([
      { startsAt: '2026-09-22T00:00:00.000Z', endsAt: '2026-09-22T09:00:00.000Z' },
      { startsAt: '2026-09-22T10:00:00.000Z', endsAt: '2026-09-23T00:00:00.000Z' },
    ]);
  });

  it('merges overlapping and touching busy events before computing gaps', async () => {
    const service = build([
      calendarEvent({ startsAt: new Date('2026-09-22T09:00:00Z'), endsAt: new Date('2026-09-22T10:30:00Z') }),
      calendarEvent({ startsAt: new Date('2026-09-22T10:00:00Z'), endsAt: new Date('2026-09-22T11:00:00Z') }), // overlaps the first
      calendarEvent({ startsAt: new Date('2026-09-22T11:00:00Z'), endsAt: new Date('2026-09-22T12:00:00Z') }), // touches the second
    ]);
    const slots = await service.freeSlots('user-1', DAY.from, DAY.to, 1, {});
    expect(slots).toEqual([
      { startsAt: '2026-09-22T00:00:00.000Z', endsAt: '2026-09-22T09:00:00.000Z' },
      { startsAt: '2026-09-22T12:00:00.000Z', endsAt: '2026-09-23T00:00:00.000Z' },
    ]);
  });

  it('excludes gaps shorter than the requested duration', async () => {
    const service = build([
      calendarEvent({ startsAt: new Date('2026-09-22T09:00:00Z'), endsAt: new Date('2026-09-22T10:00:00Z') }),
      calendarEvent({ startsAt: new Date('2026-09-22T10:15:00Z'), endsAt: new Date('2026-09-22T11:00:00Z') }), // 15-minute gap before it
    ]);
    const slots = await service.freeSlots('user-1', DAY.from, DAY.to, 30, {});
    expect(slots.some((slot) => slot.startsAt === '2026-09-22T10:00:00.000Z')).toBe(false);
    expect(slots).toEqual([
      { startsAt: '2026-09-22T00:00:00.000Z', endsAt: '2026-09-22T09:00:00.000Z' },
      { startsAt: '2026-09-22T11:00:00.000Z', endsAt: '2026-09-23T00:00:00.000Z' },
    ]);
  });

  it('treats a busy soft block as busy and a non-busy one as free', async () => {
    const busyBlock = {
      domain: 'tasks',
      status: 'ok',
      blocks: [{ id: 'b1', domain: 'tasks', title: 'Deep work', startsAt: new Date('2026-09-22T13:00:00Z'), endsAt: new Date('2026-09-22T14:00:00Z'), allDay: false, busy: true }],
    };
    const freeBlock = {
      domain: 'habits',
      status: 'ok',
      blocks: [{ id: 'b2', domain: 'habits', title: 'Optional walk', startsAt: new Date('2026-09-22T15:00:00Z'), endsAt: new Date('2026-09-22T16:00:00Z'), allDay: false, busy: false }],
    };
    const service = build([], [busyBlock, freeBlock]);
    const slots = await service.freeSlots('user-1', DAY.from, DAY.to, 30, {});
    expect(slots.some((slot) => slot.startsAt === '2026-09-22T13:00:00.000Z')).toBe(false);
    expect(slots.some((slot) => slot.startsAt <= '2026-09-22T15:00:00.000Z' && slot.endsAt >= '2026-09-22T16:00:00.000Z')).toBe(true);
  });

  it('ignores blocks from a contributor section that errored or timed out', async () => {
    const service = build([], [{ domain: 'tasks', status: 'error' }, { domain: 'habits', status: 'timeout' }]);
    const slots = await service.freeSlots('user-1', DAY.from, DAY.to, 60, {});
    expect(slots).toEqual([{ startsAt: '2026-09-22T00:00:00.000Z', endsAt: '2026-09-23T00:00:00.000Z' }]);
  });

  it('restricts results to daily working hours across several days', async () => {
    const service = build([]);
    const slots = await service.freeSlots('user-1', '2026-09-22', '2026-09-23', 60, { dayStart: '09:00', dayEnd: '17:00' });
    expect(slots).toEqual([
      { startsAt: '2026-09-22T09:00:00.000Z', endsAt: '2026-09-22T17:00:00.000Z' },
      { startsAt: '2026-09-23T09:00:00.000Z', endsAt: '2026-09-23T17:00:00.000Z' },
    ]);
  });

  it('subtracts busy time from within each day\'s working hours', async () => {
    const service = build([calendarEvent({ startsAt: new Date('2026-09-22T13:00:00Z'), endsAt: new Date('2026-09-22T14:00:00Z') })]);
    const slots = await service.freeSlots('user-1', DAY.from, DAY.to, 30, { dayStart: '09:00', dayEnd: '17:00' });
    expect(slots).toEqual([
      { startsAt: '2026-09-22T09:00:00.000Z', endsAt: '2026-09-22T13:00:00.000Z' },
      { startsAt: '2026-09-22T14:00:00.000Z', endsAt: '2026-09-22T17:00:00.000Z' },
    ]);
  });

  it('computes working-hours windows in the given timezone, DST-aware', async () => {
    const service = build([]);
    const slots = await service.freeSlots('user-1', '2026-03-08', '2026-03-08', 60, { dayStart: '09:00', dayEnd: '17:00', timezone: 'America/New_York' });
    // 2026-03-08 is the US spring-forward day: 09:00-17:00 EDT is 13:00-21:00 UTC.
    expect(slots).toEqual([{ startsAt: '2026-03-08T13:00:00.000Z', endsAt: '2026-03-08T21:00:00.000Z' }]);
  });

  it('stops once `limit` slots have been found', async () => {
    const service = build([
      calendarEvent({ startsAt: new Date('2026-09-22T02:00:00Z'), endsAt: new Date('2026-09-22T03:00:00Z') }),
      calendarEvent({ startsAt: new Date('2026-09-22T05:00:00Z'), endsAt: new Date('2026-09-22T06:00:00Z') }),
      calendarEvent({ startsAt: new Date('2026-09-22T08:00:00Z'), endsAt: new Date('2026-09-22T09:00:00Z') }),
    ]);
    const slots = await service.freeSlots('user-1', DAY.from, DAY.to, 1, { limit: 2 });
    expect(slots).toHaveLength(2);
  });

  it('requires dayStart and dayEnd together', async () => {
    const service = build([]);
    await expect(service.freeSlots('user-1', DAY.from, DAY.to, 30, { dayStart: '09:00' })).rejects.toThrow(BadRequestException);
    await expect(service.freeSlots('user-1', DAY.from, DAY.to, 30, { dayEnd: '17:00' })).rejects.toThrow(BadRequestException);
  });

  it('requires dayStart before dayEnd', async () => {
    const service = build([]);
    await expect(service.freeSlots('user-1', DAY.from, DAY.to, 30, { dayStart: '17:00', dayEnd: '09:00' })).rejects.toThrow(BadRequestException);
  });

  it('rejects a range wider than the view limit', async () => {
    const service = build([]);
    await expect(service.freeSlots('user-1', '2026-01-01', '2026-03-10', 30, {})).rejects.toThrow(BadRequestException);
  });
});
