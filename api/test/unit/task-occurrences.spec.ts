import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { Task, TaskException } from '../../src/generated/prisma/client.js';
import {
  assertTaskRulePossible,
  computeTaskSeriesUntil,
  expandTaskOccurrences,
  isNaturalTaskOccurrence,
  naturalSchedule,
  nextTaskOccurrence,
} from '../../src/tasks/recurrence/task-occurrences.js';

let counter = 0;
function task(overrides: Partial<Task> = {}): Task {
  counter += 1;
  return {
    id: `task-${counter}`,
    userId: 'user-1',
    title: 'Task',
    notes: null,
    status: 'open',
    priority: 'none',
    dueAt: new Date('2026-01-05T14:00:00Z'), // Mon 09:00 America/New_York
    scheduledStart: null,
    scheduledEnd: null,
    timezone: 'America/New_York',
    estimatedMinutes: null,
    actualMinutes: null,
    isCritical: false,
    rrule: null,
    seriesUntil: null,
    recurringGroupId: null,
    source: 'manual',
    sortOrder: 0,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function exception(taskId: string, overrides: Partial<TaskException> = {}): TaskException {
  return {
    id: `exc-${Math.random()}`,
    taskId,
    originalDueAt: new Date('2026-01-07T14:00:00Z'),
    kind: 'modified',
    title: null,
    notes: null,
    priority: null,
    dueAt: null,
    scheduledStart: null,
    scheduledEnd: null,
    estimatedMinutes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const budget = (n = 1000) => ({ remaining: n });
const win = (from: string, to: string) => ({ from: new Date(from), to: new Date(to) });

describe('expandTaskOccurrences: non-recurring tasks', () => {
  it('returns the single task when its dueAt overlaps the window', () => {
    const t = task();
    const occurrences = expandTaskOccurrences(t, [], { ...win('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'), budget: budget() });
    expect(occurrences).toEqual([
      {
        originalDueAt: t.dueAt,
        dueAt: t.dueAt,
        title: 'Task',
        notes: null,
        priority: 'none',
        scheduledStart: null,
        scheduledEnd: null,
        estimatedMinutes: null,
        modified: false,
      },
    ]);
  });

  it('is empty when neither dueAt nor scheduledStart is set', () => {
    const t = task({ dueAt: null });
    expect(expandTaskOccurrences(t, [], { ...win('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'), budget: budget() })).toEqual([]);
  });

  it('still produces one occurrence, anchored on scheduledStart, for a scheduled task with no dueAt', () => {
    const t = task({ dueAt: null, scheduledStart: new Date('2026-01-10T14:00:00Z'), scheduledEnd: new Date('2026-01-10T15:00:00Z') });
    const occurrences = expandTaskOccurrences(t, [], { ...win('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'), budget: budget() });
    expect(occurrences).toEqual([
      {
        originalDueAt: t.scheduledStart,
        dueAt: t.scheduledStart,
        title: 'Task',
        notes: null,
        priority: 'none',
        scheduledStart: t.scheduledStart,
        scheduledEnd: t.scheduledEnd,
        estimatedMinutes: null,
        modified: false,
      },
    ]);
  });

  it('excludes it when the window ends exactly at dueAt (no scheduled block)', () => {
    const t = task();
    expect(expandTaskOccurrences(t, [], { from: new Date('2025-01-01T00:00:00Z'), to: t.dueAt!, budget: budget() })).toEqual([]);
  });

  it('is included via a scheduled block even when dueAt itself is outside the window', () => {
    const t = task({
      dueAt: new Date('2026-01-01T00:00:00Z'),
      scheduledStart: new Date('2026-01-10T14:00:00Z'),
      scheduledEnd: new Date('2026-01-10T15:00:00Z'),
    });
    const occurrences = expandTaskOccurrences(t, [], { ...win('2026-01-10T00:00:00Z', '2026-01-11T00:00:00Z'), budget: budget() });
    expect(occurrences).toHaveLength(1);
  });

  it('spends exactly one unit of budget, and throws once none is left', () => {
    const t = task();
    const b = budget(1);
    expandTaskOccurrences(t, [], { ...win('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'), budget: b });
    expect(b.remaining).toBe(0);
    expect(() => expandTaskOccurrences(task(), [], { ...win('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'), budget: b })).toThrow(BadRequestException);
  });
});

describe('expandTaskOccurrences: recurrence and DST', () => {
  it('keeps the wall-clock time across a spring-forward transition', () => {
    const t = task({ rrule: 'FREQ=DAILY' });
    const occurrences = expandTaskOccurrences(t, [], { ...win('2026-03-05T00:00:00Z', '2026-03-11T00:00:00Z'), budget: budget() });
    expect(occurrences.map((o) => o.dueAt.toISOString())).toEqual([
      '2026-03-05T14:00:00.000Z', // EST, UTC-5
      '2026-03-06T14:00:00.000Z',
      '2026-03-07T14:00:00.000Z',
      '2026-03-08T13:00:00.000Z', // EDT, UTC-4, from spring-forward day
      '2026-03-09T13:00:00.000Z',
      '2026-03-10T13:00:00.000Z',
    ]);
  });

  it('preserves a scheduled block\'s wall-clock offset and duration across occurrences', () => {
    const t = task({
      rrule: 'FREQ=DAILY',
      scheduledStart: new Date('2026-01-05T18:00:00Z'), // 13:00 EST, 4h after dueAt
      scheduledEnd: new Date('2026-01-05T19:00:00Z'), // 1h block
    });
    const occurrences = expandTaskOccurrences(t, [], { ...win('2026-03-08T00:00:00Z', '2026-03-09T00:00:00Z'), budget: budget() });
    expect(occurrences).toHaveLength(1);
    // dueAt is 13:00 EDT (17:00Z); schedule keeps the same wall-clock offset, now under EDT.
    expect(occurrences[0].scheduledStart!.toISOString()).toBe('2026-03-08T17:00:00.000Z');
    expect(occurrences[0].scheduledEnd!.toISOString()).toBe('2026-03-08T18:00:00.000Z');
  });

  it('supports multiple weekdays and INTERVAL on a weekly rule', () => {
    const t = task({ timezone: 'UTC', rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR' });
    const occurrences = expandTaskOccurrences(t, [], { ...win('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'), budget: budget() });
    expect(occurrences.map((o) => o.dueAt.toISOString().slice(0, 10))).toEqual(['2026-01-05', '2026-01-07', '2026-01-09', '2026-01-19', '2026-01-21', '2026-01-23']);
  });

  it('spends one budget unit per occurrence and throws once exhausted', () => {
    const t = task({ rrule: 'FREQ=DAILY' });
    const b = budget(3);
    expect(() => expandTaskOccurrences(t, [], { ...win('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'), budget: b })).toThrow(BadRequestException);
  });
});

describe('expandTaskOccurrences: exceptions', () => {
  const series = () => task({ rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' });

  it('omits a skipped occurrence, leaving the others untouched', () => {
    const t = series();
    const wed = new Date('2026-01-07T14:00:00Z');
    const occurrences = expandTaskOccurrences(t, [exception(t.id, { originalDueAt: wed, kind: 'skipped' })], {
      ...win('2026-01-01T00:00:00Z', '2026-01-12T00:00:00Z'),
      budget: budget(),
    });
    expect(occurrences.map((o) => o.originalDueAt.toISOString())).toEqual(['2026-01-05T14:00:00.000Z', '2026-01-09T14:00:00.000Z']);
  });

  it('applies a modified occurrence\'s overrides, and inherits whatever was not overridden', () => {
    const t = series();
    const fri = new Date('2026-01-09T14:00:00Z');
    const occurrences = expandTaskOccurrences(
      t,
      [exception(t.id, { originalDueAt: fri, kind: 'modified', title: 'Renamed', priority: 'high' })],
      { ...win('2026-01-01T00:00:00Z', '2026-01-12T00:00:00Z'), budget: budget() },
    );
    const modified = occurrences.find((o) => o.originalDueAt.getTime() === fri.getTime())!;
    expect(modified).toMatchObject({ title: 'Renamed', priority: 'high', notes: null, modified: true });
    const untouched = occurrences.find((o) => o.originalDueAt.getTime() !== fri.getTime())!;
    expect(untouched.modified).toBe(false);
  });

  it('moves a modified occurrence\'s dueAt and still finds it if the new time is inside the window', () => {
    const t = series();
    const fri = new Date('2026-01-09T14:00:00Z');
    const movedDueAt = new Date('2026-01-10T18:00:00Z');
    const occurrences = expandTaskOccurrences(t, [exception(t.id, { originalDueAt: fri, kind: 'modified', dueAt: movedDueAt })], {
      ...win('2026-01-01T00:00:00Z', '2026-01-12T00:00:00Z'),
      budget: budget(),
    });
    const moved = occurrences.find((o) => o.originalDueAt.getTime() === fri.getTime())!;
    expect(moved.dueAt).toEqual(movedDueAt);
  });

  it('does not apply an exception belonging to a different task', () => {
    const t = series();
    const wed = new Date('2026-01-07T14:00:00Z');
    const occurrences = expandTaskOccurrences(t, [exception('some-other-task', { originalDueAt: wed, kind: 'skipped' })], {
      ...win('2026-01-01T00:00:00Z', '2026-01-12T00:00:00Z'),
      budget: budget(),
    });
    expect(occurrences.map((o) => o.originalDueAt.getTime())).toContain(wed.getTime());
  });
});

describe('isNaturalTaskOccurrence', () => {
  it('is true only for an instant the rule actually produces', () => {
    const t = task({ rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' });
    expect(isNaturalTaskOccurrence(t, new Date('2026-01-05T14:00:00Z'))).toBe(true); // Monday
    expect(isNaturalTaskOccurrence(t, new Date('2026-01-06T14:00:00Z'))).toBe(false); // Tuesday
  });

  it('for a non-recurring task, is true only at its own dueAt', () => {
    const t = task();
    expect(isNaturalTaskOccurrence(t, t.dueAt!)).toBe(true);
    expect(isNaturalTaskOccurrence(t, new Date(t.dueAt!.getTime() + 1))).toBe(false);
  });

  it('is false when dueAt is null', () => {
    expect(isNaturalTaskOccurrence(task({ dueAt: null }), new Date('2026-01-05T14:00:00Z'))).toBe(false);
  });
});

describe('nextTaskOccurrence', () => {
  it('is null for a non-recurring task', () => {
    expect(nextTaskOccurrence(task(), new Date('2026-01-05T14:00:00Z'))).toBeNull();
  });

  it('finds the following occurrence strictly after the given instant', () => {
    const t = task({ rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' });
    expect(nextTaskOccurrence(t, new Date('2026-01-05T14:00:00Z'))?.toISOString()).toBe('2026-01-07T14:00:00.000Z');
  });

  it('is phase-safe when re-anchored from a later occurrence (rolling-occurrence model)', () => {
    // Simulates completing occurrence after occurrence: dueAt advances to each occurrence in
    // turn, and nextTaskOccurrence is always called with the task's own (re-anchored) dueAt.
    const rrule = 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU';
    const first = task({ dueAt: new Date('2026-01-06T14:00:00Z'), rrule }); // Tuesday
    const second = nextTaskOccurrence(first, first.dueAt!)!;
    expect(second.toISOString()).toBe('2026-01-20T14:00:00.000Z'); // two weeks later
    const reanchored = task({ dueAt: second, rrule });
    const third = nextTaskOccurrence(reanchored, second)!;
    expect(third.toISOString()).toBe('2026-02-03T14:00:00.000Z'); // still on the original two-week cadence
  });

  it('returns null once the series is exhausted (COUNT-bound rule)', () => {
    const t = task({ rrule: 'FREQ=DAILY;COUNT=2' });
    const second = nextTaskOccurrence(t, t.dueAt!)!;
    expect(second.toISOString()).toBe('2026-01-06T14:00:00.000Z');
    expect(nextTaskOccurrence(t, second)).toBeNull();
  });
});

describe('assertTaskRulePossible', () => {
  it('accepts a rule that can occur', () => {
    expect(() => assertTaskRulePossible('FREQ=WEEKLY;BYDAY=MO', new Date('2026-01-05T14:00:00Z'), 'UTC')).not.toThrow();
  });

  it('rejects a rule that can never occur (Feb 30 every year)', () => {
    expect(() => assertTaskRulePossible('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30', new Date('2026-01-05T14:00:00Z'), 'UTC')).toThrow(BadRequestException);
  });

  it('defaults to UTC when timezone is null', () => {
    expect(() => assertTaskRulePossible('FREQ=DAILY', new Date('2026-01-05T14:00:00Z'), null)).not.toThrow();
  });
});

describe('computeTaskSeriesUntil', () => {
  it('is null for an open-ended rule', () => {
    expect(computeTaskSeriesUntil('FREQ=DAILY', new Date('2026-01-05T14:00:00Z'), 'UTC')).toBeNull();
  });

  it('is the true last occurrence for a COUNT-bound rule', () => {
    expect(computeTaskSeriesUntil('FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=5', new Date('2026-01-05T14:00:00Z'), 'America/New_York')).toEqual(
      new Date('2026-01-14T14:00:00Z'),
    );
  });
});

describe('naturalSchedule', () => {
  it('is null/null when the task has no schedule', () => {
    expect(naturalSchedule(task({ scheduledStart: null }), new Date('2026-02-01T14:00:00Z'))).toEqual({ scheduledStart: null, scheduledEnd: null });
  });

  it('translates the schedule to a new occurrence, preserving offset-from-dueAt and duration', () => {
    const t = task({
      dueAt: new Date('2026-01-05T14:00:00Z'), // 09:00 EST
      scheduledStart: new Date('2026-01-05T18:00:00Z'), // 13:00 EST, 4h after dueAt
      scheduledEnd: new Date('2026-01-05T19:00:00Z'), // 1h block
    });
    const result = naturalSchedule(t, new Date('2026-02-02T14:00:00Z')); // some other Monday, still 09:00 EST
    expect(result.scheduledStart!.toISOString()).toBe('2026-02-02T18:00:00.000Z');
    expect(result.scheduledEnd!.toISOString()).toBe('2026-02-02T19:00:00.000Z');
  });

  it('is safe to re-anchor across a spring-forward night: two-step rolling matches one-step direct', () => {
    const t = task({
      dueAt: new Date('2026-03-02T14:00:00Z'), // Mon 09:00 EST
      scheduledStart: new Date('2026-03-02T18:00:00Z'), // 13:00 EST
      scheduledEnd: new Date('2026-03-02T19:00:00Z'),
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      timezone: 'America/New_York',
    });
    const nextMonday = new Date('2026-03-09T13:00:00Z'); // still EST-anchored math, pre-transition
    const followingMonday = new Date('2026-03-16T13:00:00Z'); // post spring-forward, now EDT

    // Direct: anchor straight from the original master to the post-DST occurrence.
    const direct = naturalSchedule(t, followingMonday);

    // Two-step: roll to the intermediate occurrence first (as rollForwardTo does each time it
    // completes one occurrence), rebuild a self-consistent snapshot there, then roll again.
    const intermediateSchedule = naturalSchedule(t, nextMonday);
    const reanchored = { ...t, dueAt: nextMonday, ...intermediateSchedule };
    const stepTwo = naturalSchedule(reanchored, followingMonday);

    expect(stepTwo).toEqual(direct);
  });
});
