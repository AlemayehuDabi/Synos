import { Injectable, Module } from '@nestjs/common';
import {
  ReviewContributor,
  type ReviewContext,
  type ReviewContribution,
} from '../../src/reviews/review-contributor.js';
import { sandboxState, sleep } from './sandbox-state.js';

/**
 * Healthy: reports a configurable completed count, and records the context it was
 * handed. Uses 'system', the one SignalDomain no real module (calendar, tasks, habits,
 * fitness) claims - it is only ever a stand-in slot in tests.
 */
@Injectable()
@ReviewContributor('system')
export class SandboxSystemReview implements ReviewContributor {
  async collect(context: ReviewContext): Promise<ReviewContribution> {
    sandboxState.reviewContexts.push(context);
    const completed = sandboxState.tasksByUser.get(context.userId) ?? 0;
    return {
      metrics: { completed },
      highlights: completed > 0 ? [`Completed ${completed} tasks`] : [],
    };
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

/**
 * Always throws. Was @ReviewContributor('habits') until the Habits module
 * supplied a real one; 'meals' is the one remaining SignalDomain with no real
 * contributor yet.
 */
@Injectable()
@ReviewContributor('meals')
export class SandboxMealsReview implements ReviewContributor {
  async collect(): Promise<ReviewContribution> {
    throw new Error('SECRET-MEALS-PAYLOAD');
  }
}

/** One healthy domain. */
@Module({ providers: [SandboxSystemReview] })
export class SandboxReviewModule {}

/** Adds a throwing and a too-slow domain on top of SandboxReviewModule. */
@Module({ providers: [SandboxMealsReview, SandboxFinancesReview] })
export class SandboxReviewFaultsModule {}
