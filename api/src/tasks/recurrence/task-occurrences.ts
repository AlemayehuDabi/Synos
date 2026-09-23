import { BadRequestException } from '@nestjs/common';
import type { Task, TaskException } from '../../generated/prisma/client.js';
import type { TaskPriority } from '../../generated/prisma/enums.js';
import {
  assertRRulePossible,
  buildRule,
  computeSeriesUntil,
  isNaturalOccurrence,
  naturalOccurrenceEnd,
  SERIES_UNTIL_MAX_ITERATIONS,
} from '../../calendar/recurrence/occurrence-expander.js';

/**
 * Tasks reuse Calendar's recurrence engine directly (RRULE parsing/validation, the
 * safety-vetted RRuleTemporal construction, and the far-query danger analysis in
 * occurrence-expander.ts - see that module's header comment, which applies here
 * unchanged) rather than reimplementing it. A task's own `dueAt` plays the role
 * Calendar's `startsAt` does: the series DTSTART. Tasks have no `allDay` concept, so
 * `allDay: false` is passed to the shared helpers throughout, and a task's own
 * `timezone` (defaulting to UTC) stands in for Calendar's per-event timezone.
 */

type TaskAnchor = Pick<Task, 'timezone' | 'dueAt' | 'rrule'>;

function anchorTimezone(task: Pick<Task, 'timezone'>): string {
  return task.timezone ?? 'UTC';
}

/** Throws a 400 if `rrule` could never produce an occurrence from `dueAt`, or if UNTIL is unreasonable. */
export function assertTaskRulePossible(rrule: string, dueAt: Date, timezone: string | null): void {
  assertRRulePossible(rrule, dueAt, false, timezone ?? 'UTC');
}

/** The instant after which the series produces no further occurrences, or `null` if open-ended. */
export function computeTaskSeriesUntil(rrule: string, dueAt: Date, timezone: string | null): Date | null {
  return computeSeriesUntil(rrule, dueAt, false, timezone ?? 'UTC');
}

/** Whether `occurrenceDueAt` is a real occurrence of this task's rule (or, for a non-recurring task, its own dueAt). */
export function isNaturalTaskOccurrence(task: TaskAnchor, occurrenceDueAt: Date): boolean {
  if (!task.dueAt) return false;
  if (!task.rrule) return task.dueAt.getTime() === occurrenceDueAt.getTime();
  return isNaturalOccurrence({ allDay: false, timezone: anchorTimezone(task), startsAt: task.dueAt, rrule: task.rrule }, occurrenceDueAt);
}

/**
 * The next occurrence strictly after `afterDueAt`, or `null` once the series has ended
 * (`seriesUntil` passed, or the rule is simply exhausted). Always searches at-or-near the
 * task's own `dueAt` (its DTSTART), so this is cheap and safe regardless of how far
 * `afterDueAt` has drifted from the task's original creation date over many completions -
 * see the module comment. Re-anchoring DTSTART to the current `dueAt` on every roll-forward
 * (rather than keeping the original creation instant) does not change the pattern: any
 * instant the rule already produces is, by construction, an exact multiple of the rule's
 * own interval from any other, so restarting from one lands on the identical sequence.
 */
export function nextTaskOccurrence(task: TaskAnchor, afterDueAt: Date): Date | null {
  if (!task.rrule || !task.dueAt) return null;
  const rule = buildRule({ allDay: false, timezone: anchorTimezone(task), startsAt: task.dueAt, rrule: task.rrule }, SERIES_UNTIL_MAX_ITERATIONS);
  const next = rule.next(afterDueAt, false);
  return next ? new Date(next.epochMilliseconds) : null;
}

export interface TaskOccurrence {
  /** This occurrence's unmodified due date - the key TaskException rows use. */
  originalDueAt: Date;
  dueAt: Date;
  title: string;
  notes: string | null;
  priority: TaskPriority;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  estimatedMinutes: number | null;
  /** True when a `modified` exception changed this occurrence from the series default. */
  modified: boolean;
}

export interface TaskExpandOptions {
  /** Inclusive lower bound. */
  from: Date;
  /** Exclusive upper bound. */
  to: Date;
  /** How many more occurrences this call is allowed to produce; decremented as it goes. */
  budget: { remaining: number };
}

/**
 * The occurrence's scheduled block, preserving the master's wall-clock offset-from-dueAt and
 * duration across DST. Exported so TaskService's roll-forward can carry a recurring task's own
 * schedule along with `dueAt` when completing/skipping the current occurrence - otherwise the
 * master's (dueAt, scheduledStart) pair would drift out of its offset invariant on every
 * completion, corrupting every future occurrence this same function computes.
 */
export function naturalSchedule(task: Task, occurrenceDueAt: Date): { scheduledStart: Date | null; scheduledEnd: Date | null } {
  if (!task.scheduledStart) return { scheduledStart: null, scheduledEnd: null };
  const timezone = anchorTimezone(task);
  const scheduledStart = naturalOccurrenceEnd({ allDay: false, timezone, startsAt: task.dueAt!, endsAt: task.scheduledStart }, occurrenceDueAt);
  if (!task.scheduledEnd) return { scheduledStart, scheduledEnd: null };
  const scheduledEnd = naturalOccurrenceEnd({ allDay: false, timezone, startsAt: task.scheduledStart, endsAt: task.scheduledEnd }, scheduledStart);
  return { scheduledStart, scheduledEnd };
}

/**
 * Every occurrence of one task (recurring or not) whose due date, or scheduled block,
 * overlaps `[from, to)`, with exceptions applied. A `skipped` exception omits that
 * occurrence entirely (like Calendar's `cancelled`); `modified` applies its overrides.
 * Never throws for a tombstoned task; the caller filters those out beforehand.
 */
export function expandTaskOccurrences(task: Task, exceptions: TaskException[], options: TaskExpandOptions): TaskOccurrence[] {
  const ownExceptions = exceptions.filter((exception) => exception.taskId === task.id);
  const byOriginalDueAt = new Map(ownExceptions.map((exception) => [exception.originalDueAt.getTime(), exception]));

  const overlaps = (dueAt: Date, scheduledStart: Date | null, scheduledEnd: Date | null): boolean => {
    if (dueAt >= options.from && dueAt < options.to) return true;
    if (scheduledStart && scheduledEnd) return scheduledEnd > options.from && scheduledStart < options.to;
    return false;
  };

  const apply = (originalDueAt: Date, naturalDueAt: Date, schedule: { scheduledStart: Date | null; scheduledEnd: Date | null }): TaskOccurrence | null => {
    const exception = byOriginalDueAt.get(originalDueAt.getTime());
    if (exception?.kind === 'skipped') return null;
    if (exception?.kind === 'modified') {
      return {
        originalDueAt,
        dueAt: exception.dueAt ?? naturalDueAt,
        title: exception.title ?? task.title,
        notes: exception.notes ?? task.notes,
        priority: exception.priority ?? task.priority,
        scheduledStart: exception.scheduledStart ?? schedule.scheduledStart,
        scheduledEnd: exception.scheduledEnd ?? schedule.scheduledEnd,
        estimatedMinutes: exception.estimatedMinutes ?? task.estimatedMinutes,
        modified: true,
      };
    }
    return {
      originalDueAt,
      dueAt: naturalDueAt,
      title: task.title,
      notes: task.notes,
      priority: task.priority,
      scheduledStart: schedule.scheduledStart,
      scheduledEnd: schedule.scheduledEnd,
      estimatedMinutes: task.estimatedMinutes,
      modified: false,
    };
  };

  if (!task.rrule) {
    // dueAt and scheduledStart are independent optional fields (a task can be scheduled with
    // no due date at all), so a scheduled-only task still needs an anchor to be representable
    // as a single occurrence - its own scheduledStart stands in for dueAt in that case. A
    // recurring task always has dueAt (enforced at creation), so only this branch needs it.
    const anchor = task.dueAt ?? task.scheduledStart;
    if (!anchor) return [];
    const schedule = { scheduledStart: task.scheduledStart, scheduledEnd: task.scheduledEnd };
    if (!overlaps(anchor, schedule.scheduledStart, schedule.scheduledEnd)) return [];
    if (options.budget.remaining < 1) throw new BadRequestException('Too many occurrences match this query; narrow the date range');
    options.budget.remaining -= 1;
    const occurrence = apply(anchor, anchor, schedule);
    return occurrence ? [occurrence] : [];
  }

  // A recurring task always has dueAt (enforced at creation/update), unlike the non-recurring
  // case above where it is genuinely optional.
  if (!task.dueAt) return [];
  const rule = buildRule({ allDay: false, timezone: anchorTimezone(task), startsAt: task.dueAt, rrule: task.rrule }, SERIES_UNTIL_MAX_ITERATIONS);
  // Widen the search slightly before `from`: a scheduled block can start before the due
  // date search window and still overlap it. The master's own schedule offset is only a
  // rough backward bound here (a search widening amount, not a result).
  const widenMs = task.scheduledStart && task.scheduledEnd ? task.scheduledEnd.getTime() - task.scheduledStart.getTime() : 0;
  const searchFrom = new Date(options.from.getTime() - widenMs - 1);
  const candidates = rule.between(searchFrom < task.dueAt ? task.dueAt : searchFrom, options.to, true);

  const occurrences: TaskOccurrence[] = [];
  const seen = new Set<number>();
  const emit = (naturalDueAt: Date): void => {
    if (seen.has(naturalDueAt.getTime())) return;
    seen.add(naturalDueAt.getTime());
    const schedule = naturalSchedule(task, naturalDueAt);
    const occurrence = apply(naturalDueAt, naturalDueAt, schedule);
    if (!occurrence) return;
    if (!overlaps(occurrence.dueAt, occurrence.scheduledStart, occurrence.scheduledEnd)) return;
    if (options.budget.remaining < 1) throw new BadRequestException('Too many occurrences match this query; narrow the date range');
    options.budget.remaining -= 1;
    occurrences.push(occurrence);
  };

  for (const candidate of candidates) emit(new Date(candidate.epochMilliseconds));

  // A `modified` exception can move an occurrence enough that its *natural* due date
  // falls outside the widened search above; check each such exception's own
  // originalDueAt directly against the rule, mirroring Calendar's expandEvent.
  for (const exception of ownExceptions) {
    if (exception.kind !== 'modified' || seen.has(exception.originalDueAt.getTime())) continue;
    if (!isNaturalTaskOccurrence(task, exception.originalDueAt)) continue;
    emit(exception.originalDueAt);
  }

  return occurrences;
}
