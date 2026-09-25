import { Injectable } from '@nestjs/common';
import { startOfLocalDay } from '../common/time/timezone.js';
import { PrismaService } from '../lib/prisma.js';
import { ReviewContributor, type ReviewContext, type ReviewContribution } from '../reviews/review-contributor.js';
import { workoutDurationMinutes } from './training-load.js';

const round1 = (n: number) => Math.round(n * 10) / 10;
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

@Injectable()
@ReviewContributor('fitness')
export class FitnessReviewContributor implements ReviewContributor {
  constructor(private readonly prisma: PrismaService) {}

  async collect({ userId, periodStart, periodEnd, startDate, endDate }: ReviewContext): Promise<ReviewContribution> {
    const [workouts, metrics] = await Promise.all([
      this.prisma.workout.findMany({
        where: { userId, deletedAt: null, completedAt: { gte: periodStart, lt: periodEnd } },
        select: { durationMinutes: true, startedAt: true, completedAt: true },
      }),
      this.prisma.bodyMetric.findMany({
        where: { userId, date: { gte: startOfLocalDay(startDate, 'UTC'), lte: startOfLocalDay(endDate, 'UTC') } },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        select: { weightKg: true, bodyFatPct: true },
      }),
    ]);

    const workoutsCompleted = workouts.length;
    const totalDurationMinutes = workouts.reduce((sum, workout) => sum + workoutDurationMinutes(workout), 0);

    const weights = metrics.flatMap((m) => (m.weightKg == null ? [] : [m.weightKg]));
    const bodyFats = metrics.flatMap((m) => (m.bodyFatPct == null ? [] : [m.bodyFatPct]));
    const trend = (values: number[]) => (values.length >= 2 ? round1(values[values.length - 1] - values[0]) : null);
    const weightChangeKg = trend(weights);
    const bodyFatChangePct = trend(bodyFats);

    const highlights: string[] = [];
    if (workoutsCompleted > 0) highlights.push(`Completed ${plural(workoutsCompleted, 'workout')} (${totalDurationMinutes} min)`);
    if (weightChangeKg != null && weightChangeKg !== 0) highlights.push(`Weight ${weightChangeKg < 0 ? 'down' : 'up'} ${Math.abs(weightChangeKg)} kg`);
    if (bodyFatChangePct != null && bodyFatChangePct !== 0) highlights.push(`Body fat ${bodyFatChangePct < 0 ? 'down' : 'up'} ${Math.abs(bodyFatChangePct)}%`);

    return {
      metrics: {
        workoutsCompleted,
        totalDurationMinutes,
        avgWorkoutMinutes: workoutsCompleted > 0 ? Math.round(totalDurationMinutes / workoutsCompleted) : 0,
        weightStartKg: weights[0] ?? null,
        weightEndKg: weights.at(-1) ?? null,
        weightChangeKg,
        bodyFatChangePct,
      },
      highlights,
      hasActivity: workoutsCompleted > 0 || metrics.length > 0,
    };
  }
}
