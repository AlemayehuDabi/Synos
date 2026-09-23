import type { Task } from '../generated/prisma/client.js';
import type { TaskPriority, TaskSource, TaskStatus } from '../generated/prisma/enums.js';
import type { TaskOccurrence } from './recurrence/task-occurrences.js';

export interface TaskView {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  timezone: string | null;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  isCritical: boolean;
  rrule: string | null;
  seriesUntil: string | null;
  recurringGroupId: string | null;
  source: TaskSource;
  sortOrder: number;
  completedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

export function toTaskView(task: Task): TaskView {
  return {
    id: task.id,
    title: task.title,
    notes: task.notes,
    status: task.status,
    priority: task.priority,
    dueAt: iso(task.dueAt),
    scheduledStart: iso(task.scheduledStart),
    scheduledEnd: iso(task.scheduledEnd),
    timezone: task.timezone,
    estimatedMinutes: task.estimatedMinutes,
    actualMinutes: task.actualMinutes,
    isCritical: task.isCritical,
    rrule: task.rrule,
    seriesUntil: iso(task.seriesUntil),
    recurringGroupId: task.recurringGroupId,
    source: task.source,
    sortOrder: task.sortOrder,
    completedAt: iso(task.completedAt),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export interface TaskOccurrenceView {
  taskId: string;
  originalDueAt: string;
  title: string;
  notes: string | null;
  priority: TaskPriority;
  dueAt: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  estimatedMinutes: number | null;
  modified: boolean;
}

export function toTaskOccurrenceView(taskId: string, occurrence: TaskOccurrence): TaskOccurrenceView {
  return {
    taskId,
    originalDueAt: occurrence.originalDueAt.toISOString(),
    title: occurrence.title,
    notes: occurrence.notes,
    priority: occurrence.priority,
    dueAt: occurrence.dueAt.toISOString(),
    scheduledStart: iso(occurrence.scheduledStart),
    scheduledEnd: iso(occurrence.scheduledEnd),
    estimatedMinutes: occurrence.estimatedMinutes,
    modified: occurrence.modified,
  };
}
