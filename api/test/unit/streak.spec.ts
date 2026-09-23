import { describe, expect, it } from 'vitest';
import {
  classifyUnit,
  computeHabitStreak,
  computeStreak,
  scheduledUnits,
  targetForUnit,
  type ScheduledUnit,
  type UnitOutcome,
} from '../../src/habits/streak.js';

describe('scheduledUnits', () => {
  it('daily: every calendar date in range', () => {
    expect(scheduledUnits('daily', [], 1, '2026-09-01', '2026-09-04')).toEqual([
      { start: '2026-09-01', end: '2026-09-01' },
      { start: '2026-09-02', end: '2026-09-02' },
      { start: '2026-09-03', end: '2026-09-03' },
      { start: '2026-09-04', end: '2026-09-04' },
    ]);
  });

  it('specificDays: only dates matching scheduleDays (0=Sun..6=Sat)', () => {
    // 2026-09-01 is a Tuesday (2); scheduleDays [2, 4] = Tue, Thu.
    const units = scheduledUnits('specificDays', [2, 4], 1, '2026-09-01', '2026-09-10');
    expect(units.map((u) => u.start)).toEqual(['2026-09-01', '2026-09-03', '2026-09-08', '2026-09-10']);
    expect(units.every((u) => u.start === u.end)).toBe(true);
  });

  it('weekly: one unit per week, aligned to weekStartsOn', () => {
    // 2026-09-07 is a Monday. weekStartsOn=1 (Monday).
    const units = scheduledUnits('weekly', [], 1, '2026-09-09', '2026-09-20');
    expect(units).toEqual([
      { start: '2026-09-07', end: '2026-09-13' },
      { start: '2026-09-14', end: '2026-09-20' },
    ]);
  });

  it('weekly: aligns to a Sunday-start week when weekStartsOn=0', () => {
    const units = scheduledUnits('weekly', [], 0, '2026-09-09', '2026-09-12');
    expect(units).toEqual([{ start: '2026-09-06', end: '2026-09-12' }]);
  });

  it('timesPerWeek: same unit shape as weekly', () => {
    expect(scheduledUnits('timesPerWeek', [], 1, '2026-09-09', '2026-09-13')).toEqual([{ start: '2026-09-07', end: '2026-09-13' }]);
  });

  it('timesPerMonth: one unit per calendar month', () => {
    const units = scheduledUnits('timesPerMonth', [], 1, '2026-09-15', '2026-11-05');
    expect(units).toEqual([
      { start: '2026-09-01', end: '2026-09-30' },
      { start: '2026-10-01', end: '2026-10-31' },
      { start: '2026-11-01', end: '2026-11-30' },
    ]);
  });

  it('handles a single-day range', () => {
    expect(scheduledUnits('daily', [], 1, '2026-09-01', '2026-09-01')).toEqual([{ start: '2026-09-01', end: '2026-09-01' }]);
  });
});

describe('targetForUnit', () => {
  it('is 1 for daily, weekly and specificDays regardless of targetPerPeriod', () => {
    expect(targetForUnit('daily', 5)).toBe(1);
    expect(targetForUnit('weekly', 5)).toBe(1);
    expect(targetForUnit('specificDays', 5)).toBe(1);
  });

  it('is targetPerPeriod for timesPerWeek/timesPerMonth, defaulting to 1', () => {
    expect(targetForUnit('timesPerWeek', 3)).toBe(3);
    expect(targetForUnit('timesPerMonth', 10)).toBe(10);
    expect(targetForUnit('timesPerWeek', null)).toBe(1);
  });
});

describe('classifyUnit', () => {
  const unit: ScheduledUnit = { start: '2026-09-01', end: '2026-09-01' };
  const today = '2026-09-05'; // well after the unit, so it's always "elapsed" here

  describe('build habits', () => {
    it('succeeds once doneCount reaches target', () => {
      expect(classifyUnit(unit, 'build', 1, false, 1, today)).toBe('success');
      expect(classifyUnit(unit, 'build', 3, false, 3, today)).toBe('success');
    });

    it('is a miss when elapsed with too few done entries', () => {
      expect(classifyUnit(unit, 'build', 0, false, 1, today)).toBe('miss');
      expect(classifyUnit(unit, 'build', 2, false, 3, today)).toBe('miss');
    });

    it('is pending while still in progress with too few done entries', () => {
      expect(classifyUnit(unit, 'build', 0, false, 1, '2026-09-01')).toBe('pending');
    });
  });

  describe('break habits', () => {
    it('succeeds once elapsed with no slip, regardless of doneCount', () => {
      expect(classifyUnit(unit, 'break', 0, false, 1, today)).toBe('success');
    });

    it('is a miss the instant there is a slip, even mid-unit (not yet elapsed)', () => {
      expect(classifyUnit(unit, 'break', 0, true, 1, '2026-09-01')).toBe('miss');
      expect(classifyUnit(unit, 'break', 0, true, 1, today)).toBe('miss');
    });

    it('is pending while still in progress with no slip yet', () => {
      expect(classifyUnit(unit, 'break', 0, false, 1, '2026-09-01')).toBe('pending');
    });
  });
});

describe('computeStreak', () => {
  const outcomes = (pattern: UnitOutcome[]): { unit: ScheduledUnit; outcome: UnitOutcome }[] =>
    pattern.map((outcome, i) => ({ unit: { start: `2026-01-${String(i + 1).padStart(2, '0')}`, end: `2026-01-${String(i + 1).padStart(2, '0')}` }, outcome }));

  it('is 0/0/null with no units', () => {
    expect(computeStreak([], 1)).toEqual({ current: 0, best: 0, graceUsedAt: null });
  });

  it('counts a plain run of successes', () => {
    expect(computeStreak(outcomes(['success', 'success', 'success']), 1)).toEqual({ current: 3, best: 3, graceUsedAt: null });
  });

  it('a miss with nothing preceding it stays at 0, no grace spent', () => {
    expect(computeStreak(outcomes(['miss', 'miss', 'success']), 1)).toEqual({ current: 1, best: 1, graceUsedAt: null });
  });

  it('pending units never affect the streak either way', () => {
    expect(computeStreak(outcomes(['success', 'success', 'pending']), 1)).toEqual({ current: 2, best: 2, graceUsedAt: null });
  });

  it('forgives a single missed unit within the grace window, continuing (not just preserving) the streak', () => {
    const result = computeStreak(outcomes(['success', 'success', 'miss', 'success', 'success']), 1);
    expect(result).toEqual({ current: 4, best: 4, graceUsedAt: '2026-01-03' });
  });

  it('breaks the streak once consecutive misses exceed the grace window', () => {
    const result = computeStreak(outcomes(['success', 'success', 'miss', 'miss', 'success']), 1);
    expect(result).toEqual({ current: 1, best: 2, graceUsedAt: null });
  });

  it('does not grant a second grace pass within the same streak', () => {
    const result = computeStreak(outcomes(['success', 'miss', 'success', 'miss', 'success']), 1);
    // First miss forgiven (streak -> 2), second miss (grace already spent) breaks it, third success restarts at 1.
    expect(result).toEqual({ current: 1, best: 2, graceUsedAt: '2026-01-02' });
  });

  it('grace is once per unbroken streak, not once per gap: a second gap on the same still-running streak breaks it', () => {
    const result = computeStreak(outcomes(['success', 'miss', 'success', 'success', 'miss', 'success']), 1);
    // Gap 1 (index 1) forgiven -> streak grows 1 -> 2 -> 3 (indices 0,2,3). The streak never actually
    // broke in between, so grace is still spent; gap 2 (index 4) breaks it, and index 5 restarts at 1.
    expect(result).toEqual({ current: 1, best: 3, graceUsedAt: '2026-01-02' });
  });

  it('a trailing unresolved miss reports current 0 but keeps the best from before it', () => {
    const result = computeStreak(outcomes(['success', 'success', 'miss']), 1);
    expect(result).toEqual({ current: 0, best: 2, graceUsedAt: null });
  });

  it('grace window of 0 forgives nothing', () => {
    const result = computeStreak(outcomes(['success', 'miss', 'success']), 0);
    expect(result).toEqual({ current: 1, best: 1, graceUsedAt: null });
  });

  it('a wider grace window tolerates that many consecutive misses', () => {
    const result = computeStreak(outcomes(['success', 'miss', 'miss', 'miss', 'success']), 3);
    expect(result).toEqual({ current: 2, best: 2, graceUsedAt: '2026-01-02' });
  });

  it('tracks best separately from a later-broken current streak', () => {
    const result = computeStreak(outcomes(['success', 'success', 'success', 'miss', 'miss', 'success']), 1);
    expect(result).toEqual({ current: 1, best: 3, graceUsedAt: null });
  });
});

describe('computeHabitStreak (end-to-end)', () => {
  const entry = (date: string, status: 'done' | 'slipped') => ({ date: new Date(`${date}T00:00:00Z`), status });

  it('build/daily: a clean run with the current day still pending', () => {
    const habit = {
      type: 'build' as const,
      schedule: 'daily' as const,
      scheduleDays: [],
      targetPerPeriod: null,
      timezone: 'UTC',
      createdAt: new Date('2026-09-01T00:00:00Z'),
    };
    const entries = [entry('2026-09-01', 'done'), entry('2026-09-02', 'done'), entry('2026-09-03', 'done')];
    const result = computeHabitStreak(habit, entries, new Date('2026-09-04T10:00:00Z'), 1, 1);
    expect(result).toEqual({ current: 3, best: 3, graceUsedAt: null }); // Sep 4 itself is pending, not counted
  });

  it('build/daily: a missed day forgiven by grace when the next day is done', () => {
    const habit = {
      type: 'build' as const,
      schedule: 'daily' as const,
      scheduleDays: [],
      targetPerPeriod: null,
      timezone: 'UTC',
      createdAt: new Date('2026-09-01T00:00:00Z'),
    };
    // Sep 1, 2 done; Sep 3 missed (no entry); Sep 4 done.
    const entries = [entry('2026-09-01', 'done'), entry('2026-09-02', 'done'), entry('2026-09-04', 'done')];
    const result = computeHabitStreak(habit, entries, new Date('2026-09-05T10:00:00Z'), 1, 1);
    expect(result).toEqual({ current: 3, best: 3, graceUsedAt: '2026-09-03' });
  });

  it('break/daily: no entries at all is a perfect streak (nothing to slip)', () => {
    const habit = {
      type: 'break' as const,
      schedule: 'daily' as const,
      scheduleDays: [],
      targetPerPeriod: null,
      timezone: 'UTC',
      createdAt: new Date('2026-09-01T00:00:00Z'),
    };
    const result = computeHabitStreak(habit, [], new Date('2026-09-04T10:00:00Z'), 1, 1);
    expect(result).toEqual({ current: 3, best: 3, graceUsedAt: null }); // Sep 1-3 elapsed and clean; Sep 4 pending
  });

  it('break/daily: a slip resets the streak, grace forgives a single slipped day if the next is clean', () => {
    const habit = {
      type: 'break' as const,
      schedule: 'daily' as const,
      scheduleDays: [],
      targetPerPeriod: null,
      timezone: 'UTC',
      createdAt: new Date('2026-09-01T00:00:00Z'),
    };
    const entries = [entry('2026-09-03', 'slipped')];
    const result = computeHabitStreak(habit, entries, new Date('2026-09-05T10:00:00Z'), 1, 1);
    // Sep 1, 2 clean (streak 2); Sep 3 slipped (forgiven since Sep 4 is clean); Sep 4 clean, streak continues to 3.
    expect(result).toEqual({ current: 3, best: 3, graceUsedAt: '2026-09-03' });
  });

  it('build/specificDays: only matching weekdays count, others are ignored entirely', () => {
    const habit = {
      type: 'build' as const,
      schedule: 'specificDays' as const,
      scheduleDays: [1, 3, 5], // Mon, Wed, Fri
      targetPerPeriod: null,
      timezone: 'UTC',
      createdAt: new Date('2026-09-07T00:00:00Z'), // Monday
    };
    // Mon 9/7 done, Wed 9/9 done, Fri 9/11 done; Tue/Thu untouched (irrelevant).
    const entries = [entry('2026-09-07', 'done'), entry('2026-09-09', 'done'), entry('2026-09-11', 'done')];
    const result = computeHabitStreak(habit, entries, new Date('2026-09-12T10:00:00Z'), 1, 1); // Saturday, all 3 elapsed
    expect(result).toEqual({ current: 3, best: 3, graceUsedAt: null });
  });

  it('build/timesPerWeek: a week succeeds once it reaches targetPerPeriod done entries', () => {
    const habit = {
      type: 'build' as const,
      schedule: 'timesPerWeek' as const,
      scheduleDays: [],
      targetPerPeriod: 2,
      timezone: 'UTC',
      createdAt: new Date('2026-09-07T00:00:00Z'), // Monday, week 1
    };
    // Week of Sep 7-13: 2 done entries (meets target). Week of Sep 14-20: only 1 done (misses).
    const entries = [entry('2026-09-08', 'done'), entry('2026-09-10', 'done'), entry('2026-09-15', 'done')];
    const result = computeHabitStreak(habit, entries, new Date('2026-09-22T10:00:00Z'), 1, 0); // both weeks elapsed, week 3 pending
    expect(result.current).toBe(0); // most recent elapsed week (Sep 14-20) missed target
    expect(result.best).toBe(1);
  });

  it('build/timesPerMonth: streak counts consecutive successful months', () => {
    const habit = {
      type: 'build' as const,
      schedule: 'timesPerMonth' as const,
      scheduleDays: [],
      targetPerPeriod: 2,
      timezone: 'UTC',
      createdAt: new Date('2026-07-01T00:00:00Z'),
    };
    const entries = [
      entry('2026-07-05', 'done'),
      entry('2026-07-20', 'done'),
      entry('2026-08-05', 'done'),
      entry('2026-08-20', 'done'),
    ];
    const result = computeHabitStreak(habit, entries, new Date('2026-09-15T10:00:00Z'), 1, 0); // July, Aug elapsed; Sep pending
    expect(result).toEqual({ current: 2, best: 2, graceUsedAt: null });
  });

  it('is 0/0/null for a habit created in the future relative to "now"', () => {
    const habit = {
      type: 'build' as const,
      schedule: 'daily' as const,
      scheduleDays: [],
      targetPerPeriod: null,
      timezone: 'UTC',
      createdAt: new Date('2026-09-10T00:00:00Z'),
    };
    const result = computeHabitStreak(habit, [], new Date('2026-09-05T10:00:00Z'), 1, 1);
    expect(result).toEqual({ current: 0, best: 0, graceUsedAt: null });
  });

  it('respects the habit\'s own timezone when resolving "today" and entry dates', () => {
    const habit = {
      type: 'build' as const,
      schedule: 'daily' as const,
      scheduleDays: [],
      targetPerPeriod: null,
      timezone: 'Pacific/Kiritimati', // UTC+14
      createdAt: new Date('2026-09-01T00:00:00Z'),
    };
    // 2026-09-04T11:00:00Z is already 2026-09-05 01:00 in UTC+14.
    const entries = [entry('2026-09-01', 'done'), entry('2026-09-02', 'done'), entry('2026-09-03', 'done'), entry('2026-09-04', 'done')];
    const result = computeHabitStreak(habit, entries, new Date('2026-09-04T11:00:00Z'), 1, 1);
    expect(result.current).toBe(4); // all 4 days, including the 4th, are already elapsed locally
  });
});
