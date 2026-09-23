import type { Habit, HabitEntry } from '../generated/prisma/client.js';
import type { HabitEntryStatus, HabitSchedule, HabitSource, HabitType } from '../generated/prisma/enums.js';
import { localDateInTimezone } from '../common/time/timezone.js';

export interface HabitView {
  id: string;
  title: string;
  notes: string | null;
  type: HabitType;
  schedule: HabitSchedule;
  scheduleDays: number[];
  targetPerPeriod: number | null;
  timezone: string;
  color: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  source: HabitSource;
  createdAt: Date;
  updatedAt: Date;
}

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

export function toHabitView(habit: Habit): HabitView {
  return {
    id: habit.id,
    title: habit.title,
    notes: habit.notes,
    type: habit.type,
    schedule: habit.schedule,
    scheduleDays: habit.scheduleDays,
    targetPerPeriod: habit.targetPerPeriod,
    timezone: habit.timezone,
    color: habit.color,
    isArchived: habit.isArchived,
    archivedAt: iso(habit.archivedAt),
    source: habit.source,
    createdAt: habit.createdAt,
    updatedAt: habit.updatedAt,
  };
}

export interface HabitEntryView {
  id: string;
  habitId: string;
  date: string;
  status: HabitEntryStatus;
  note: string | null;
  source: HabitSource;
  createdAt: Date;
  updatedAt: Date;
}

/** `entry.date` is stored as a UTC-midnight instant; reading it back with `timezone: 'UTC'` recovers the exact "YYYY-MM-DD" it was written with, regardless of the habit's own timezone. */
export function toHabitEntryView(entry: HabitEntry): HabitEntryView {
  return {
    id: entry.id,
    habitId: entry.habitId,
    date: localDateInTimezone(entry.date, 'UTC'),
    status: entry.status,
    note: entry.note,
    source: entry.source,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}
