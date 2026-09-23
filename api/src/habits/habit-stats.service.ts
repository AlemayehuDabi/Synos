import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../lib/prisma.js';
import { HabitService } from './habit.service.js';
import { computeHabitStreak, type StreakResult } from './streak.js';

@Injectable()
export class HabitStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly habits: HabitService,
    private readonly config: ConfigService,
  ) {}

  async stats(userId: string, habitId: string, now: Date = new Date()): Promise<StreakResult> {
    const habit = await this.habits.findOwned(userId, habitId);
    const entries = await this.prisma.habitEntry.findMany({
      where: { habitId, deletedAt: null },
      select: { date: true, status: true },
    });
    const settings = await this.prisma.userSettings.findUnique({ where: { userId }, select: { weekStartsOn: true } });
    const graceWindowDays = this.config.get<number>('HABITS_GRACE_WINDOW_DAYS', 1);

    return computeHabitStreak(habit, entries, now, settings?.weekStartsOn ?? 1, graceWindowDays);
  }
}
