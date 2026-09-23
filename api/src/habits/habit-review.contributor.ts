import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../lib/prisma.js';
import { ReviewContributor, type ReviewContext, type ReviewContribution } from '../reviews/review-contributor.js';
import { computeHabitStreak, scheduledUnits, targetForUnit } from './streak.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Metrics values must be flat primitives (see ReviewMetricValue), so the per-habit
 * breakdown the brief asks for ("completion rate, slips, current/best streak deltas ...
 * per habit") lives in `highlights` - one line per habit that did anything or whose
 * streak moved - while `metrics` carries the aggregate rollup across every active habit,
 * the same shape every other domain's review section uses.
 */
@Injectable()
@ReviewContributor('habits')
export class HabitReviewContributor implements ReviewContributor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async collect({ userId, periodStart, periodEnd, startDate, endDate }: ReviewContext): Promise<ReviewContribution> {
    const habits = await this.prisma.habit.findMany({ where: { userId, deletedAt: null, isArchived: false } });
    const settings = await this.prisma.userSettings.findUnique({ where: { userId }, select: { weekStartsOn: true } });
    const weekStartsOn = settings?.weekStartsOn ?? 1;
    const graceWindowDays = this.config.get<number>('HABITS_GRACE_WINDOW_DAYS', 1);

    let totalCompleted = 0;
    let totalSlips = 0;
    let totalScheduled = 0;
    const highlights: string[] = [];

    for (const habit of habits) {
      const entries = await this.prisma.habitEntry.findMany({ where: { habitId: habit.id, deletedAt: null }, select: { date: true, status: true } });

      const inPeriod = entries.filter((e) => e.date >= periodStart && e.date < periodEnd);
      const completed = inPeriod.filter((e) => e.status === 'done').length;
      const slips = inPeriod.filter((e) => e.status === 'slipped').length;

      const units = scheduledUnits(habit.schedule, habit.scheduleDays, weekStartsOn, startDate, endDate);
      const target = targetForUnit(habit.schedule, habit.targetPerPeriod);
      totalCompleted += completed;
      totalSlips += slips;
      totalScheduled += units.length * target;

      const before = computeHabitStreak(habit, entries, periodStart, weekStartsOn, graceWindowDays);
      const after = computeHabitStreak(habit, entries, periodEnd, weekStartsOn, graceWindowDays);
      const currentStreakDelta = after.current - before.current;
      const bestStreakDelta = after.best - before.best;

      if (completed > 0 || slips > 0 || currentStreakDelta !== 0 || bestStreakDelta !== 0) {
        const parts = [`completed ${completed}`];
        if (slips > 0) parts.push(`slipped ${slips}`);
        if (currentStreakDelta !== 0) parts.push(`streak ${currentStreakDelta > 0 ? '+' : ''}${currentStreakDelta} (now ${after.current})`);
        if (bestStreakDelta > 0) parts.push(`new best ${after.best}`);
        highlights.push(`"${habit.title}": ${parts.join(', ')}`);
      }
    }

    const completionRate = totalScheduled > 0 ? round2(totalCompleted / totalScheduled) : 0;
    return {
      metrics: { completed: totalCompleted, slips: totalSlips, completionRate },
      highlights,
      hasActivity: totalCompleted > 0 || totalSlips > 0,
    };
  }
}
