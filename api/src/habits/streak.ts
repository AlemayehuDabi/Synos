import { addDaysToDate, firstDayOfMonth, lastDayOfMonth, localDateInTimezone, weekdayOfDate } from '../common/time/timezone.js';
import type { HabitEntryStatus, HabitSchedule, HabitType } from '../generated/prisma/enums.js';

/**
 * One scheduled unit of the habit's own cadence: a single day for `daily`/`specificDays`,
 * or a whole week/month for `weekly`/`timesPerWeek`/`timesPerMonth`. Streaks count
 * consecutive successful *units*, never raw calendar days - a weekly habit's streak is a
 * streak of weeks, not days.
 */
export interface ScheduledUnit {
  /** Inclusive, "YYYY-MM-DD". */
  start: string;
  /** Inclusive, "YYYY-MM-DD". */
  end: string;
}

/** Every scheduled unit from `from` through `to`, both inclusive, in ascending order. */
export function scheduledUnits(schedule: HabitSchedule, scheduleDays: number[], weekStartsOn: number, from: string, to: string): ScheduledUnit[] {
  if (schedule === 'daily') return daysInRange(from, to).map((d) => ({ start: d, end: d }));
  if (schedule === 'specificDays') {
    return daysInRange(from, to)
      .filter((d) => scheduleDays.includes(weekdayOfDate(d)))
      .map((d) => ({ start: d, end: d }));
  }
  if (schedule === 'weekly' || schedule === 'timesPerWeek') return weeksInRange(from, to, weekStartsOn);
  return monthsInRange(from, to);
}

function daysInRange(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDaysToDate(d, 1)) days.push(d);
  return days;
}

function weeksInRange(from: string, to: string, weekStartsOn: number): ScheduledUnit[] {
  const daysIntoWeek = (weekdayOfDate(from) - weekStartsOn + 7) % 7;
  const units: ScheduledUnit[] = [];
  for (let start = addDaysToDate(from, -daysIntoWeek); start <= to; start = addDaysToDate(start, 7)) {
    units.push({ start, end: addDaysToDate(start, 6) });
  }
  return units;
}

function monthsInRange(from: string, to: string): ScheduledUnit[] {
  const units: ScheduledUnit[] = [];
  for (let start = firstDayOfMonth(from); start <= to; start = addDaysToDate(lastDayOfMonth(start), 1)) {
    units.push({ start, end: lastDayOfMonth(start) });
  }
  return units;
}

/** The target count of qualifying entries a unit needs to succeed (build habits only - see classifyUnit). */
export function targetForUnit(schedule: HabitSchedule, targetPerPeriod: number | null): number {
  if (schedule === 'timesPerWeek' || schedule === 'timesPerMonth') return targetPerPeriod ?? 1;
  return 1;
}

export type UnitOutcome = 'success' | 'miss' | 'pending';

/**
 * `build`: succeeds once it has `target` or more `done` entries; with none yet, it is
 * `pending` while still in progress (today falls inside/before it) and only becomes a
 * `miss` once it has fully elapsed.
 * `break`: succeeds by default - "without a slipped entry" - so an elapsed unit with no
 * slip is a success and a still-in-progress one with no slip yet is `pending` (not yet
 * locked in); a `slipped` entry fails it immediately, even mid-unit.
 */
export function classifyUnit(unit: ScheduledUnit, habitType: HabitType, doneCount: number, hasSlip: boolean, target: number, today: string): UnitOutcome {
  const elapsed = unit.end < today;
  if (habitType === 'break') {
    if (hasSlip) return 'miss';
    return elapsed ? 'success' : 'pending';
  }
  if (doneCount >= target) return 'success';
  return elapsed ? 'miss' : 'pending';
}

export interface StreakResult {
  current: number;
  best: number;
  /** The start date of the most recent unit a grace pass was actually used on, or null if never used. */
  graceUsedAt: string | null;
}

/**
 * Walks scheduled units oldest-to-newest, counting consecutive successes as one streak.
 * `pending` units (typically only the last, still-in-progress one) never affect it either
 * way. Grace: up to `graceWindowDays` *consecutive* missed units are tolerated as a single
 * gap, at most once per streak, provided a success follows before the tolerance is
 * exceeded - the streak then continues (does not merely survive at its old length) through
 * the gap. A second miss once grace is already spent, or a gap wider than the window,
 * breaks the streak; the next success starts a fresh one.
 */
export function computeStreak(units: { unit: ScheduledUnit; outcome: UnitOutcome }[], graceWindowDays: number): StreakResult {
  let run = 0;
  let best = 0;
  let pendingMissCount = 0;
  let pendingMissStart: string | null = null;
  let graceAvailable = true;
  let graceUsedAt: string | null = null;

  for (const { unit, outcome } of units) {
    if (outcome === 'pending') continue;

    if (outcome === 'success') {
      if (pendingMissCount > 0) {
        if (pendingMissCount <= graceWindowDays && graceAvailable) {
          graceUsedAt = pendingMissStart;
          graceAvailable = false;
          run += 1;
        } else {
          run = 1;
          graceAvailable = true;
        }
        pendingMissCount = 0;
        pendingMissStart = null;
      } else {
        run += 1;
      }
      best = Math.max(best, run);
      continue;
    }

    // miss
    if (run === 0) continue; // nothing to protect
    pendingMissCount += 1;
    if (pendingMissCount === 1) pendingMissStart = unit.start;
    if (pendingMissCount > graceWindowDays || !graceAvailable) {
      run = 0;
      graceAvailable = true;
      pendingMissCount = 0;
      pendingMissStart = null;
    }
  }

  return { current: pendingMissCount > 0 ? 0 : run, best, graceUsedAt };
}

export interface HabitForStreak {
  type: HabitType;
  schedule: HabitSchedule;
  scheduleDays: number[];
  targetPerPeriod: number | null;
  timezone: string;
  createdAt: Date;
}

export interface EntryForStreak {
  date: Date;
  status: HabitEntryStatus;
}

/**
 * Ties scheduledUnits/classifyUnit/computeStreak together against a habit's own history.
 * `now` and `weekStartsOn` are passed in (rather than read here) so this stays a pure,
 * fully unit-testable function with no I/O of its own.
 */
export function computeHabitStreak(habit: HabitForStreak, entries: EntryForStreak[], now: Date, weekStartsOn: number, graceWindowDays: number): StreakResult {
  const today = localDateInTimezone(now, habit.timezone);
  const from = localDateInTimezone(habit.createdAt, habit.timezone);
  if (from > today) return { current: 0, best: 0, graceUsedAt: null };

  const units = scheduledUnits(habit.schedule, habit.scheduleDays, weekStartsOn, from, today);
  const target = targetForUnit(habit.schedule, habit.targetPerPeriod);

  const classified = units.map((unit) => {
    const inUnit = entries.filter((e) => {
      const d = localDateInTimezone(e.date, habit.timezone);
      return d >= unit.start && d <= unit.end;
    });
    const doneCount = inUnit.filter((e) => e.status === 'done').length;
    const hasSlip = inUnit.some((e) => e.status === 'slipped');
    return { unit, outcome: classifyUnit(unit, habit.type, doneCount, hasSlip, target, today) };
  });

  return computeStreak(classified, graceWindowDays);
}
