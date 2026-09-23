import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EDIT_SCOPES, type EditScope } from '../calendar/dto/update-event.dto.js';
import {
  type CursorPage,
  decodeNumericCompoundCursor,
  encodeNumericCompoundCursor,
  numericCompoundCursorWhere,
  resolvePageSize,
} from '../common/pagination/cursor-pagination.js';
import type { Prisma, Task } from '../generated/prisma/client.js';
import type { TaskPriority, TaskSource, TaskStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../lib/prisma.js';
import { SignalEngineFacade } from '../signal-engine/signal-engine.facade.js';
import { updateAdaptiveEstimate } from './adaptive-estimate.js';
import { toTaskOccurrenceView, toTaskView, type TaskOccurrenceView, type TaskView } from './task.mapper.js';
import type { CompleteTaskDto } from './dto/complete-task.dto.js';
import type { CreateTaskDto } from './dto/create-task.dto.js';
import type { ScheduleTaskDto } from './dto/schedule-task.dto.js';
import type { SkipTaskDto } from './dto/skip-task.dto.js';
import type { UpdateRecurrenceDto } from './dto/update-recurrence.dto.js';
import type { UpdateTaskDto } from './dto/update-task.dto.js';
import { assertTaskRulePossible, computeTaskSeriesUntil, isNaturalTaskOccurrence, naturalSchedule, nextTaskOccurrence } from './recurrence/task-occurrences.js';
import { truncateRRuleBefore } from '../calendar/recurrence/rrule.js';

/** The recovery-to-task-load ActionHandler uses this exact same format for its suggestion's targetKey. */
export const recoveryTargetKey = (taskId: string): string => `task:${taskId}:load`;

const LOAD_FIELDS = ['scheduledStart', 'scheduledEnd', 'estimatedMinutes'] as const;

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signalEngine: SignalEngineFacade,
  ) {}

  async create(userId: string, dto: CreateTaskDto): Promise<TaskView> {
    const timezone = await this.resolveTimezone(userId, dto.timezone);
    const dueAt = dto.dueAt !== undefined ? this.parseInstant(dto.dueAt, 'dueAt') : null;
    const { scheduledStart, scheduledEnd } = this.parseSchedule(dto.scheduledStart, dto.scheduledEnd);
    if (scheduledStart) this.assertScheduleTiming(scheduledStart, scheduledEnd);

    if (dto.rrule) {
      if (!dueAt) throw new BadRequestException('rrule requires dueAt');
      assertTaskRulePossible(dto.rrule, dueAt, timezone);
    }
    const seriesUntil = dto.rrule && dueAt ? computeTaskSeriesUntil(dto.rrule, dueAt, timezone) : null;
    // Newly captured tasks append to the end of the caller's own list by default (same
    // convention as SubtaskService.create), so the default sortOrder is meaningful until the
    // caller explicitly reorders - otherwise every task ties at the schema default of 0.
    const last = await this.prisma.task.findFirst({ where: { userId, deletedAt: null }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const sortOrder = (last?.sortOrder ?? -1) + 1;

    try {
      const task = await this.prisma.$transaction(async (tx) => {
        const created = await tx.task.create({
          data: {
            ...(dto.id ? { id: dto.id } : {}),
            userId,
            title: dto.title,
            notes: dto.notes,
            priority: (dto.priority ?? 'none') as TaskPriority,
            dueAt,
            scheduledStart,
            scheduledEnd,
            timezone: dueAt || scheduledStart ? timezone : null,
            estimatedMinutes: dto.estimatedMinutes,
            isCritical: dto.isCritical ?? false,
            rrule: dto.rrule,
            seriesUntil,
            source: (dto.source ?? 'manual') as TaskSource,
            sortOrder,
          },
        });
        if (dto.rrule) {
          return tx.task.update({ where: { id: created.id }, data: { recurringGroupId: created.id } });
        }
        return created;
      });
      return toTaskView(task);
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException('A task with this id already exists');
      throw error;
    }
  }

  async get(userId: string, id: string): Promise<TaskView> {
    return toTaskView(await this.findOwned(userId, id));
  }

  async list(
    userId: string,
    filters: { status?: TaskStatus; priority?: TaskPriority; dueBefore?: string; dueAfter?: string; recurringGroupId?: string; unscheduled?: boolean },
    pagination: { cursor?: string; limit?: number },
  ): Promise<CursorPage<TaskView>> {
    const take = resolvePageSize(pagination.limit);
    const where: Prisma.TaskWhereInput = {
      userId,
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.recurringGroupId ? { recurringGroupId: filters.recurringGroupId } : {}),
      ...(filters.unscheduled ? { scheduledStart: null } : {}),
      ...(filters.dueBefore || filters.dueAfter
        ? {
            dueAt: {
              ...(filters.dueBefore ? { lte: this.parseInstant(filters.dueBefore, 'dueBefore') } : {}),
              ...(filters.dueAfter ? { gte: this.parseInstant(filters.dueAfter, 'dueAfter') } : {}),
            },
          }
        : {}),
      ...(pagination.cursor ? numericCompoundCursorWhere('sortOrder', decodeNumericCompoundCursor(pagination.cursor), 'asc') : {}),
    };

    const rows = await this.prisma.task.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: take + 1 });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const last = items.at(-1);
    return {
      items: items.map(toTaskView),
      nextCursor: hasMore && last ? this.encodeSortOrderCursor(last) : null,
    };
  }

  async update(userId: string, id: string, dto: UpdateTaskDto): Promise<TaskView | TaskOccurrenceView> {
    const task = await this.findOwned(userId, id);
    const scope = dto.scope ?? 'all';
    this.assertScopeApplies(task, scope);
    const occurrenceStart = this.resolveOccurrenceStart(task, scope, dto.occurrenceStart);

    if (scope === 'this') return this.updateOccurrence(task, occurrenceStart!, dto);
    if (scope === 'following') return this.splitSeries(task, occurrenceStart!, dto);
    return this.updateAll(task, dto);
  }

  async remove(userId: string, id: string, scope: EditScope, occurrenceStartRaw?: string): Promise<void> {
    const task = await this.findOwned(userId, id);
    this.assertScopeApplies(task, scope);
    const occurrenceStart = this.resolveOccurrenceStart(task, scope, occurrenceStartRaw);

    if (scope === 'this') {
      await this.upsertSkippedException(task.id, occurrenceStart!);
      return;
    }
    if (scope === 'following') {
      await this.truncateFrom(task, occurrenceStart!);
      return;
    }
    await this.prisma.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } });
  }

  /** Skips one occurrence (creates a `skipped` exception); the current occurrence also rolls `dueAt` forward. */
  async skip(userId: string, id: string, dto: SkipTaskDto): Promise<TaskView> {
    const task = await this.findOwned(userId, id);
    if (!task.dueAt) throw new BadRequestException('This task has no dueAt to skip');
    const occurrenceStart = dto.occurrenceStart ? this.parseInstant(dto.occurrenceStart, 'occurrenceStart') : task.dueAt;
    if (!isNaturalTaskOccurrence(task, occurrenceStart)) {
      throw new BadRequestException('occurrenceStart is not an occurrence of this task');
    }

    await this.upsertSkippedException(task.id, occurrenceStart);
    if (occurrenceStart.getTime() !== task.dueAt.getTime()) return toTaskView(task);
    return toTaskView(await this.rollForward(task));
  }

  /**
   * Completes the task's current occurrence: updates the adaptive estimate (if
   * `actualMinutes` is given), then either rolls `dueAt` forward to the next
   * occurrence (status stays 'open') or, for a non-recurring task or one whose
   * series has ended, marks the whole task 'completed'.
   */
  async complete(userId: string, id: string, dto: CompleteTaskDto): Promise<TaskView> {
    const task = await this.findOwned(userId, id);
    if (task.status !== 'open') throw new ConflictException('Task is not open');

    await this.prisma.taskCompletion.create({
      data: {
        taskId: task.id,
        userId: task.userId,
        recurringGroupId: task.recurringGroupId,
        dueAt: task.dueAt,
        estimatedMinutes: task.estimatedMinutes,
        actualMinutes: dto.actualMinutes,
      },
    });

    const estimatedMinutes = dto.actualMinutes !== undefined ? updateAdaptiveEstimate(task.estimatedMinutes, dto.actualMinutes) : task.estimatedMinutes;
    const next = task.rrule ? nextTaskOccurrence(task, task.dueAt!) : null;

    if (next && (!task.seriesUntil || next <= task.seriesUntil)) {
      const rolled = await this.rollForward(task, { estimatedMinutes, actualMinutes: dto.actualMinutes ?? null, next });
      return toTaskView(rolled);
    }

    const updated = await this.prisma.task.update({
      where: { id: task.id },
      data: { status: 'completed', completedAt: new Date(), actualMinutes: dto.actualMinutes, estimatedMinutes },
    });
    return toTaskView(updated);
  }

  async reopen(userId: string, id: string): Promise<TaskView> {
    const task = await this.findOwned(userId, id);
    if (task.status !== 'completed') throw new ConflictException('Task is not completed');
    const updated = await this.prisma.task.update({
      where: { id: task.id },
      data: { status: 'open', completedAt: null },
    });
    return toTaskView(updated);
  }

  async schedule(userId: string, id: string, dto: ScheduleTaskDto): Promise<TaskView> {
    const task = await this.findOwned(userId, id);
    if (dto.scheduledStart === null) {
      const updated = await this.applyLoadChange(task, { scheduledStart: null, scheduledEnd: null });
      return toTaskView(updated);
    }
    const timezone = await this.resolveTimezone(userId, dto.timezone ?? task.timezone ?? undefined);
    const scheduledStart = this.parseInstant(dto.scheduledStart, 'scheduledStart');
    if (!dto.scheduledEnd) throw new BadRequestException('scheduledEnd is required when scheduledStart is set');
    const scheduledEnd = this.parseInstant(dto.scheduledEnd, 'scheduledEnd');
    this.assertScheduleTiming(scheduledStart, scheduledEnd);

    const updated = await this.applyLoadChange(task, { scheduledStart, scheduledEnd, timezone });
    return toTaskView(updated);
  }

  async updateRecurrence(userId: string, id: string, dto: UpdateRecurrenceDto): Promise<TaskView | TaskOccurrenceView> {
    return this.update(userId, id, { rrule: dto.rrule, scope: dto.scope, occurrenceStart: dto.occurrenceStart });
  }

  async reorder(userId: string, orderedIds: string[]): Promise<void> {
    const owned = await this.prisma.task.findMany({ where: { userId, id: { in: orderedIds }, deletedAt: null }, select: { id: true } });
    if (owned.length !== orderedIds.length) throw new BadRequestException('Every id must be one of the caller\'s own, non-deleted tasks');

    await this.prisma.$transaction(
      orderedIds.map((taskId, index) => this.prisma.task.update({ where: { id: taskId }, data: { sortOrder: index } })),
    );
  }

  // --- scope=this ---------------------------------------------------------------------

  private async updateOccurrence(task: Task, occurrenceStart: Date, dto: UpdateTaskDto): Promise<TaskOccurrenceView> {
    if (dto.isCritical !== undefined || dto.timezone !== undefined || dto.rrule !== undefined || dto.source !== undefined) {
      throw new BadRequestException('isCritical, timezone, rrule and source can only be changed with scope "all" or "following"');
    }
    const dueAt = dto.dueAt !== undefined ? (dto.dueAt === null ? null : this.parseInstant(dto.dueAt, 'dueAt')) : undefined;

    const change: Partial<{ title: string; notes: string | null; priority: TaskPriority; dueAt: Date | null; estimatedMinutes: number }> = {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dueAt !== undefined ? { dueAt } : {}),
      ...(dto.estimatedMinutes !== undefined ? { estimatedMinutes: dto.estimatedMinutes } : {}),
    };
    const exception = await this.prisma.taskException.upsert({
      where: { taskId_originalDueAt: { taskId: task.id, originalDueAt: occurrenceStart } },
      create: { taskId: task.id, originalDueAt: occurrenceStart, kind: 'modified', ...change },
      update: { kind: 'modified', ...change },
    });
    return toTaskOccurrenceView(task.id, {
      originalDueAt: occurrenceStart,
      dueAt: exception.dueAt ?? occurrenceStart,
      title: exception.title ?? task.title,
      notes: exception.notes ?? task.notes,
      priority: exception.priority ?? task.priority,
      scheduledStart: exception.scheduledStart,
      scheduledEnd: exception.scheduledEnd,
      estimatedMinutes: exception.estimatedMinutes ?? task.estimatedMinutes,
      modified: true,
    });
  }

  // --- scope=all -----------------------------------------------------------------------

  private async updateAll(task: Task, dto: UpdateTaskDto): Promise<TaskView> {
    const timezone = dto.timezone !== undefined ? await this.resolveTimezone(task.userId, dto.timezone) : task.timezone;
    const rrule = dto.rrule !== undefined ? dto.rrule : task.rrule;
    const dueAt = dto.dueAt !== undefined ? (dto.dueAt === null ? null : this.parseInstant(dto.dueAt, 'dueAt')) : task.dueAt;

    if (rrule) {
      if (!dueAt) throw new BadRequestException('rrule requires dueAt');
      assertTaskRulePossible(rrule, dueAt, timezone);
    }
    const seriesUntil = rrule && dueAt ? computeTaskSeriesUntil(rrule, dueAt, timezone) : null;
    const recurringGroupId = rrule ? (task.recurringGroupId ?? task.id) : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.task.update({
        where: { id: task.id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          dueAt,
          timezone,
          ...(dto.isCritical !== undefined ? { isCritical: dto.isCritical } : {}),
          ...(dto.estimatedMinutes !== undefined ? { estimatedMinutes: dto.estimatedMinutes } : {}),
          rrule,
          seriesUntil,
          recurringGroupId,
          ...(dto.source !== undefined ? { source: dto.source } : {}),
        },
      });
      await this.remapExceptions(tx, row, row);
      return row;
    });
    await this.maybeRecordLoadCorrection(task, updated);
    return toTaskView(updated);
  }

  // --- scope=following -------------------------------------------------------------------

  private async splitSeries(task: Task, occurrenceStart: Date, dto: UpdateTaskDto): Promise<TaskView> {
    if (!task.dueAt || occurrenceStart.getTime() <= task.dueAt.getTime()) {
      return this.updateAll(task, dto);
    }

    const timezone = dto.timezone !== undefined ? await this.resolveTimezone(task.userId, dto.timezone) : task.timezone;
    const rrule = dto.rrule !== undefined ? dto.rrule : task.rrule;
    const dueAt = dto.dueAt !== undefined ? (dto.dueAt === null ? occurrenceStart : this.parseInstant(dto.dueAt, 'dueAt')) : occurrenceStart;

    if (rrule) assertTaskRulePossible(rrule, dueAt, timezone);
    const seriesUntil = rrule ? computeTaskSeriesUntil(rrule, dueAt, timezone) : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const truncatedRRule = truncateRRuleBefore(task.rrule!, occurrenceStart);
      await tx.task.update({
        where: { id: task.id },
        data: { rrule: truncatedRRule, seriesUntil: computeTaskSeriesUntil(truncatedRRule, task.dueAt!, task.timezone) },
      });

      const created = await tx.task.create({
        data: {
          userId: task.userId,
          title: dto.title !== undefined ? dto.title : task.title,
          notes: dto.notes !== undefined ? dto.notes : task.notes,
          priority: dto.priority !== undefined ? dto.priority : task.priority,
          dueAt,
          timezone,
          estimatedMinutes: dto.estimatedMinutes !== undefined ? dto.estimatedMinutes : task.estimatedMinutes,
          isCritical: dto.isCritical !== undefined ? dto.isCritical : task.isCritical,
          rrule,
          seriesUntil,
          recurringGroupId: rrule ? (task.recurringGroupId ?? task.id) : null,
          source: dto.source !== undefined ? dto.source : task.source,
        },
      });

      const movable = await tx.taskException.findMany({ where: { taskId: task.id, originalDueAt: { gte: occurrenceStart } } });
      await this.remapExceptions(tx, created, task, movable);

      return created;
    });
    return toTaskView(updated);
  }

  // --- shared helpers ----------------------------------------------------------------------

  private async remapExceptions(
    tx: Prisma.TransactionClient,
    target: Task,
    source: Task,
    explicit?: { id: string; originalDueAt: Date }[],
  ): Promise<void> {
    const exceptions = explicit ?? (await tx.taskException.findMany({ where: { taskId: source.id } }));
    const toDelete: string[] = [];
    const toMove: string[] = [];
    for (const exception of exceptions) {
      const stillApplies = target.rrule !== null && isNaturalTaskOccurrence(target, exception.originalDueAt);
      if (stillApplies) toMove.push(exception.id);
      else toDelete.push(exception.id);
    }
    if (toDelete.length > 0) await tx.taskException.deleteMany({ where: { id: { in: toDelete } } });
    if (toMove.length > 0 && target.id !== source.id) {
      await tx.taskException.updateMany({ where: { id: { in: toMove } }, data: { taskId: target.id } });
    }
  }

  private async upsertSkippedException(taskId: string, originalDueAt: Date): Promise<void> {
    await this.prisma.taskException.upsert({
      where: { taskId_originalDueAt: { taskId, originalDueAt } },
      create: { taskId, originalDueAt, kind: 'skipped' },
      update: { kind: 'skipped', title: null, notes: null, priority: null, dueAt: null, scheduledStart: null, scheduledEnd: null, estimatedMinutes: null },
    });
  }

  private async truncateFrom(task: Task, occurrenceStart: Date): Promise<void> {
    if (!task.dueAt || occurrenceStart.getTime() <= task.dueAt.getTime()) {
      await this.prisma.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } });
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      const truncatedRRule = truncateRRuleBefore(task.rrule!, occurrenceStart);
      await tx.task.update({
        where: { id: task.id },
        data: { rrule: truncatedRRule, seriesUntil: computeTaskSeriesUntil(truncatedRRule, task.dueAt!, task.timezone) },
      });
      await tx.taskException.deleteMany({ where: { taskId: task.id, originalDueAt: { gte: occurrenceStart } } });
    });
  }

  /** Rolls a recurring task's own `dueAt` (and, if set, its schedule) forward to its next occurrence. */
  private async rollForward(task: Task, completion?: { estimatedMinutes: number | null; actualMinutes: number | null; next: Date }): Promise<Task> {
    return this.rollForwardTo(task, completion?.next ?? nextTaskOccurrence(task, task.dueAt!), completion);
  }

  private async rollForwardTo(task: Task, next: Date | null, completion?: { estimatedMinutes: number | null; actualMinutes: number | null }): Promise<Task> {
    if (!next) {
      return this.prisma.task.update({ where: { id: task.id }, data: { status: 'completed', completedAt: new Date() } });
    }

    // Absorb any exception already waiting at the new current occurrence, so the master
    // always reflects whatever was pre-planned for it, and it is not applied twice.
    const waiting = await this.prisma.taskException.findUnique({ where: { taskId_originalDueAt: { taskId: task.id, originalDueAt: next } } });
    if (waiting?.kind === 'skipped') {
      await this.prisma.taskException.delete({ where: { id: waiting.id } });
      // Re-anchor scheduledStart/End to `next` too, not just dueAt, so this stays a
      // self-consistent (dueAt, scheduledStart) pair for a further recursive roll-forward -
      // otherwise the next naturalSchedule() call would compute the offset from a
      // dueAt/scheduledStart pair that no longer correspond to the same occurrence.
      const rolled = { ...task, dueAt: next, ...naturalSchedule(task, next) };
      return this.rollForwardTo(rolled, nextTaskOccurrence(rolled, next), completion);
    }

    // Roll the schedule forward by the same wall-clock offset as dueAt, so the master's own
    // (dueAt, scheduledStart) pair keeps the invariant expandTaskOccurrences relies on for
    // every future occurrence - otherwise it would drift further out of sync on every completion.
    const rolledSchedule = naturalSchedule(task, next);

    const data: Prisma.TaskUpdateInput = {
      dueAt: next,
      completedAt: null,
      actualMinutes: completion ? completion.actualMinutes : task.actualMinutes,
      estimatedMinutes: completion ? completion.estimatedMinutes : task.estimatedMinutes,
      scheduledStart: rolledSchedule.scheduledStart,
      scheduledEnd: rolledSchedule.scheduledEnd,
      ...(waiting?.kind === 'modified'
        ? {
            title: waiting.title ?? task.title,
            notes: waiting.notes ?? task.notes,
            priority: waiting.priority ?? task.priority,
            scheduledStart: waiting.scheduledStart ?? rolledSchedule.scheduledStart,
            scheduledEnd: waiting.scheduledEnd ?? rolledSchedule.scheduledEnd,
            estimatedMinutes: waiting.estimatedMinutes ?? (completion ? completion.estimatedMinutes : task.estimatedMinutes),
          }
        : {}),
    };
    const [updated] = await this.prisma.$transaction([
      this.prisma.task.update({ where: { id: task.id }, data }),
      ...(waiting ? [this.prisma.taskException.delete({ where: { id: waiting.id } })] : []),
    ]);
    return updated;
  }

  /** Sets scheduledStart/End directly on the task (used by /schedule), correcting a superseded recovery-to-task-load suggestion if it touched the same fields. */
  private async applyLoadChange(task: Task, change: { scheduledStart: Date | null; scheduledEnd: Date | null; timezone?: string }): Promise<Task> {
    const updated = await this.prisma.task.update({
      where: { id: task.id },
      data: { scheduledStart: change.scheduledStart, scheduledEnd: change.scheduledEnd, ...(change.timezone ? { timezone: change.timezone } : {}) },
    });
    await this.maybeRecordLoadCorrection(task, updated);
    return updated;
  }

  /** If this write changed a field recovery-to-task-load can auto-adjust, this is ground truth: supersede any still-pending suggestion and log the correction. */
  private async maybeRecordLoadCorrection(before: Task, after: Task): Promise<void> {
    const changed = LOAD_FIELDS.some((field) => before[field]?.valueOf() !== after[field]?.valueOf());
    if (!changed) return;
    const targetKey = recoveryTargetKey(before.id);
    await this.signalEngine.supersedePending(before.userId, targetKey, 'manual edit', { type: 'task', id: before.id });
    await this.signalEngine.recordCorrection(before.userId, {
      targetKey,
      entityRef: { type: 'task', id: before.id },
      before: { scheduledStart: before.scheduledStart, scheduledEnd: before.scheduledEnd, estimatedMinutes: before.estimatedMinutes },
      after: { scheduledStart: after.scheduledStart, scheduledEnd: after.scheduledEnd, estimatedMinutes: after.estimatedMinutes },
    });
  }

  private assertScopeApplies(task: Task, scope: EditScope): void {
    if (!EDIT_SCOPES.includes(scope)) throw new BadRequestException(`scope must be one of ${EDIT_SCOPES.join(', ')}`);
    if (scope !== 'all' && !task.rrule) throw new BadRequestException('scope "this"/"following" only apply to a recurring task');
  }

  private resolveOccurrenceStart(task: Task, scope: EditScope, raw: string | undefined): Date | undefined {
    if (scope === 'all') return undefined;
    if (!raw) throw new BadRequestException('occurrenceStart is required for scope "this"/"following"');
    const occurrenceStart = this.parseInstant(raw, 'occurrenceStart');
    if (!isNaturalTaskOccurrence(task, occurrenceStart)) {
      throw new BadRequestException('occurrenceStart is not an occurrence of this task');
    }
    return occurrenceStart;
  }

  private async findOwned(userId: string, id: string): Promise<Task> {
    const task = await this.prisma.task.findFirst({ where: { id, userId, deletedAt: null } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private async resolveTimezone(userId: string, override?: string): Promise<string> {
    if (override) return override;
    const settings = await this.prisma.userSettings.findUnique({ where: { userId }, select: { timezone: true } });
    return settings?.timezone ?? 'UTC';
  }

  private parseInstant(value: string, field: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${field} must be a valid ISO-8601 instant`);
    return parsed;
  }

  private parseSchedule(scheduledStartRaw: string | undefined, scheduledEndRaw: string | undefined): { scheduledStart: Date | null; scheduledEnd: Date | null } {
    if ((scheduledStartRaw === undefined) !== (scheduledEndRaw === undefined)) {
      throw new BadRequestException('scheduledStart and scheduledEnd must be given together');
    }
    return {
      scheduledStart: scheduledStartRaw !== undefined ? this.parseInstant(scheduledStartRaw, 'scheduledStart') : null,
      scheduledEnd: scheduledEndRaw !== undefined ? this.parseInstant(scheduledEndRaw, 'scheduledEnd') : null,
    };
  }

  private assertScheduleTiming(scheduledStart: Date, scheduledEnd: Date | null): void {
    if (!scheduledEnd) throw new BadRequestException('scheduledEnd is required when scheduledStart is set');
    if (!(scheduledEnd > scheduledStart)) throw new BadRequestException('scheduledEnd must be after scheduledStart');
  }

  private encodeSortOrderCursor(task: Task): string {
    return encodeNumericCompoundCursor(task.sortOrder, task.id);
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
  }
}
