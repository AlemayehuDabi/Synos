import { Injectable } from '@nestjs/common';
import { PrismaService } from '../lib/prisma.js';
import { ReviewContributor, type ReviewContext, type ReviewContribution } from '../reviews/review-contributor.js';

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
@ReviewContributor('tasks')
export class TaskReviewContributor implements ReviewContributor {
  constructor(private readonly prisma: PrismaService) {}

  async collect({ userId, periodStart, periodEnd }: ReviewContext): Promise<ReviewContribution> {
    const [completions, missed] = await Promise.all([
      this.prisma.taskCompletion.findMany({
        where: { userId, completedAt: { gte: periodStart, lt: periodEnd } },
        select: { estimatedMinutes: true, actualMinutes: true },
      }),
      this.prisma.signal.count({ where: { userId, type: 'task.missed', occurredAt: { gte: periodStart, lt: periodEnd } } }),
    ]);

    const completed = completions.length;
    const completionRate = completed + missed > 0 ? round2(completed / (completed + missed)) : 0;

    const accuracySamples = completions
      .filter((c) => c.estimatedMinutes != null && c.estimatedMinutes > 0 && c.actualMinutes != null)
      .map((c) => Math.max(0, 1 - Math.abs(c.actualMinutes! - c.estimatedMinutes!) / c.estimatedMinutes!));
    const avgEstimateAccuracy = accuracySamples.length > 0 ? round2(accuracySamples.reduce((a, b) => a + b, 0) / accuracySamples.length) : null;

    const highlights: string[] = [];
    if (completed > 0) highlights.push(`Completed ${plural(completed, 'task')}`);
    if (missed > 0) highlights.push(`Missed ${plural(missed, 'task')}`);

    return { metrics: { completed, missed, completionRate, avgEstimateAccuracy }, highlights };
  }
}
