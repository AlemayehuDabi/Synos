import { Injectable, Module } from '@nestjs/common';
import {
  ReviewContributor,
  type ReviewContext,
  type ReviewContribution,
} from '../../src/reviews/review-contributor.js';
import { sandboxState, sleep } from './sandbox-state.js';

/**
 * Healthy: reports a configurable completed count, and records the context it was
 * handed. Uses 'fitness', since the real Calendar and Tasks modules now supply
 * @ReviewContributor('calendar')/@ReviewContributor('tasks').
 */
@Injectable()
@ReviewContributor('fitness')
export class SandboxFitnessReview implements ReviewContributor {
  async collect(context: ReviewContext): Promise<ReviewContribution> {
    sandboxState.reviewContexts.push(context);
    const completed = sandboxState.tasksByUser.get(context.userId) ?? 0;
    return {
      metrics: { completed },
      highlights: completed > 0 ? [`Completed ${completed} tasks`] : [],
    };
  }
}

/** Always throws. */
@Injectable()
@ReviewContributor('habits')
export class SandboxHabitsReview implements ReviewContributor {
  async collect(): Promise<ReviewContribution> {
    throw new Error('SECRET-HABIT-PAYLOAD');
  }
}

/** Far slower than REVIEW_CONTRIBUTOR_TIMEOUT_MS. */
@Injectable()
@ReviewContributor('finances')
export class SandboxFinancesReview implements ReviewContributor {
  async collect(): Promise<ReviewContribution> {
    await sleep(5_000);
    return { metrics: { billsPaid: 4 }, highlights: ['Paid 4 bills'] };
  }
}

/** One healthy domain. */
@Module({ providers: [SandboxFitnessReview] })
export class SandboxReviewModule {}

/** Adds a throwing and a too-slow domain on top of SandboxReviewModule. */
@Module({ providers: [SandboxHabitsReview, SandboxFinancesReview] })
export class SandboxReviewFaultsModule {}
