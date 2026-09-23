import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Habit, Prisma } from '../generated/prisma/client.js';
import type { HabitEntryStatus, HabitSchedule, HabitSource, HabitType } from '../generated/prisma/enums.js';
import { PrismaService } from '../lib/prisma.js';
import { localDateInTimezone, startOfLocalDay, weekdayOfDate } from '../common/time/timezone.js';
import { type CursorPage, compoundCursorWhere, decodeCompoundCursor, encodeCompoundCursor, resolvePageSize } from '../common/pagination/cursor-pagination.js';
import type { CreateHabitDto } from './dto/create-habit.dto.js';
import type { UpdateHabitDto } from './dto/update-habit.dto.js';
import { toHabitView, type HabitView } from './habit.mapper.js';

export interface HabitTodayItem {
  id: string;
  title: string;
  type: HabitType;
  schedule: HabitSchedule;
  entryStatus: HabitEntryStatus | null;
  /** Satisfies TodayItem's index signature so this can be returned directly as a TodayContribution. */
  [key: string]: unknown;
}

export interface HabitTodayResult {
  summary: { scheduledCount: number; doneCount: number };
  items: HabitTodayItem[];
}

@Injectable()
export class HabitService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateHabitDto): Promise<HabitView> {
    const timezone = await this.resolveTimezone(userId, dto.timezone);
    const scheduleDays = this.resolveScheduleDays(dto.schedule, dto.scheduleDays);
    const targetPerPeriod = this.resolveTargetPerPeriod(dto.schedule, dto.targetPerPeriod);

    try {
      const habit = await this.prisma.habit.create({
        data: {
          ...(dto.id ? { id: dto.id } : {}),
          userId,
          title: dto.title,
          notes: dto.notes,
          type: dto.type,
          schedule: dto.schedule,
          scheduleDays,
          targetPerPeriod,
          timezone,
          color: dto.color,
          source: (dto.source ?? 'manual') as HabitSource,
        },
      });
      return toHabitView(habit);
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException('A habit with this id already exists');
      throw error;
    }
  }

  async get(userId: string, id: string): Promise<HabitView> {
    return toHabitView(await this.findOwned(userId, id));
  }

  async list(
    userId: string,
    filters: { type?: HabitType; isArchived?: boolean },
    pagination: { cursor?: string; limit?: number },
  ): Promise<CursorPage<HabitView>> {
    const take = resolvePageSize(pagination.limit);
    const where: Prisma.HabitWhereInput = {
      userId,
      deletedAt: null,
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.isArchived !== undefined ? { isArchived: filters.isArchived } : {}),
      ...(pagination.cursor ? compoundCursorWhere('createdAt', decodeCompoundCursor(pagination.cursor), 'asc') : {}),
    };

    const rows = await this.prisma.habit.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: take + 1 });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const last = items.at(-1);
    return {
      items: items.map(toHabitView),
      nextCursor: hasMore && last ? encodeCompoundCursor(last.createdAt, last.id) : null,
    };
  }

  async update(userId: string, id: string, dto: UpdateHabitDto): Promise<HabitView> {
    const habit = await this.findOwned(userId, id);
    const timezone = dto.timezone !== undefined ? await this.resolveTimezone(userId, dto.timezone) : habit.timezone;
    const schedule = dto.schedule !== undefined ? dto.schedule : habit.schedule;

    const scheduleDays =
      dto.scheduleDays !== undefined ? this.resolveScheduleDays(schedule, dto.scheduleDays) : dto.schedule !== undefined ? this.resolveScheduleDays(schedule, habit.scheduleDays) : undefined;
    const targetPerPeriod =
      dto.targetPerPeriod !== undefined
        ? this.resolveTargetPerPeriod(schedule, dto.targetPerPeriod)
        : dto.schedule !== undefined
          ? this.resolveTargetPerPeriod(schedule, habit.targetPerPeriod ?? undefined)
          : undefined;

    const updated = await this.prisma.habit.update({
      where: { id: habit.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.schedule !== undefined ? { schedule: dto.schedule } : {}),
        ...(scheduleDays !== undefined ? { scheduleDays } : {}),
        ...(targetPerPeriod !== undefined ? { targetPerPeriod } : {}),
        timezone,
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.source !== undefined ? { source: dto.source } : {}),
      },
    });
    return toHabitView(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    const habit = await this.findOwned(userId, id);
    await this.prisma.habit.update({ where: { id: habit.id }, data: { deletedAt: new Date() } });
  }

  async archive(userId: string, id: string): Promise<HabitView> {
    const habit = await this.findOwned(userId, id);
    if (habit.isArchived) return toHabitView(habit);
    const updated = await this.prisma.habit.update({ where: { id: habit.id }, data: { isArchived: true, archivedAt: new Date() } });
    return toHabitView(updated);
  }

  /** Active habits scheduled "today" (per each habit's own schedule and timezone), with today's entry status if any. */
  async today(userId: string): Promise<HabitTodayResult> {
    const habits = await this.prisma.habit.findMany({ where: { userId, deletedAt: null, isArchived: false } });
    const now = new Date();

    const items: HabitTodayItem[] = [];
    let doneCount = 0;
    for (const habit of habits) {
      const today = localDateInTimezone(now, habit.timezone);
      if (habit.schedule === 'specificDays' && !habit.scheduleDays.includes(weekdayOfDate(today))) continue;

      // eslint-disable-next-line no-await-in-loop
      const entry = await this.prisma.habitEntry.findFirst({
        where: { habitId: habit.id, date: startOfLocalDay(today, 'UTC'), deletedAt: null },
        select: { status: true },
      });
      if (entry?.status === 'done') doneCount += 1;
      items.push({ id: habit.id, title: habit.title, type: habit.type, schedule: habit.schedule, entryStatus: entry?.status ?? null });
    }
    return { summary: { scheduledCount: items.length, doneCount }, items };
  }

  async findOwned(userId: string, id: string): Promise<Habit> {
    const habit = await this.prisma.habit.findFirst({ where: { id, userId, deletedAt: null } });
    if (!habit) throw new NotFoundException('Habit not found');
    return habit;
  }

  private async resolveTimezone(userId: string, override?: string): Promise<string> {
    if (override) return override;
    const settings = await this.prisma.userSettings.findUnique({ where: { userId }, select: { timezone: true } });
    return settings?.timezone ?? 'UTC';
  }

  private resolveScheduleDays(schedule: HabitSchedule, scheduleDays?: number[]): number[] {
    if (schedule !== 'specificDays') return [];
    if (!scheduleDays || scheduleDays.length === 0) {
      throw new BadRequestException('scheduleDays is required (and non-empty) for schedule "specificDays"');
    }
    return [...new Set(scheduleDays)].sort((a, b) => a - b);
  }

  private resolveTargetPerPeriod(schedule: HabitSchedule, targetPerPeriod?: number | null): number | null {
    if (schedule !== 'timesPerWeek' && schedule !== 'timesPerMonth') return null;
    if (!targetPerPeriod) {
      throw new BadRequestException('targetPerPeriod is required for schedule "timesPerWeek"/"timesPerMonth"');
    }
    return targetPerPeriod;
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
  }
}
