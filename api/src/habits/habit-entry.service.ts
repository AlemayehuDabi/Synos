import { Injectable, NotFoundException } from '@nestjs/common';
import type { HabitEntry } from '../generated/prisma/client.js';
import { PrismaService } from '../lib/prisma.js';
import { addDaysToDate, localDateInTimezone, startOfLocalDay } from '../common/time/timezone.js';
import { HabitService } from './habit.service.js';
import { toHabitEntryView, type HabitEntryView } from './habit.mapper.js';
import type { UpdateEntryDto } from './dto/update-entry.dto.js';
import type { UpsertEntryDto } from './dto/upsert-entry.dto.js';

@Injectable()
export class HabitEntryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly habits: HabitService,
  ) {}

  async list(userId: string, habitId: string, range: { from?: string; to?: string }): Promise<HabitEntryView[]> {
    const habit = await this.habits.findOwned(userId, habitId);
    const to = range.to ?? localDateInTimezone(new Date(), habit.timezone);
    const from = range.from ?? addDaysToDate(to, -30);

    const rows = await this.prisma.habitEntry.findMany({
      where: { habitId, deletedAt: null, date: { gte: startOfLocalDay(from, 'UTC'), lte: startOfLocalDay(to, 'UTC') } },
      orderBy: { date: 'asc' },
    });
    return rows.map(toHabitEntryView);
  }

  /** One entry per (habitId, date): posting the same date again updates it in place rather than duplicating. */
  async upsert(userId: string, habitId: string, dto: UpsertEntryDto): Promise<HabitEntryView> {
    const habit = await this.habits.findOwned(userId, habitId);
    const date = dto.date ?? localDateInTimezone(new Date(), habit.timezone);
    const at = startOfLocalDay(date, 'UTC');

    const entry = await this.prisma.habitEntry.upsert({
      where: { habitId_date: { habitId, date: at } },
      create: { habitId, userId, date: at, status: dto.status ?? 'done', note: dto.note, source: 'manual', deletedAt: null },
      update: { status: dto.status ?? 'done', note: dto.note ?? null, source: 'manual', deletedAt: null },
    });
    return toHabitEntryView(entry);
  }

  async update(userId: string, habitId: string, entryId: string, dto: UpdateEntryDto): Promise<HabitEntryView> {
    await this.habits.findOwned(userId, habitId);
    await this.findOwnedEntry(habitId, entryId);
    const updated = await this.prisma.habitEntry.update({
      where: { id: entryId },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        source: 'manual',
      },
    });
    return toHabitEntryView(updated);
  }

  async remove(userId: string, habitId: string, entryId: string): Promise<void> {
    await this.habits.findOwned(userId, habitId);
    await this.findOwnedEntry(habitId, entryId);
    await this.prisma.habitEntry.update({ where: { id: entryId }, data: { deletedAt: new Date() } });
  }

  private async findOwnedEntry(habitId: string, entryId: string): Promise<HabitEntry> {
    const entry = await this.prisma.habitEntry.findFirst({ where: { id: entryId, habitId, deletedAt: null } });
    if (!entry) throw new NotFoundException('Entry not found');
    return entry;
  }
}
