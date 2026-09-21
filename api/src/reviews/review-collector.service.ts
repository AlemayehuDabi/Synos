import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { runWithTimeout } from '../common/async/run-with-timeout.js';
import { SignalEngineFacade } from '../signal-engine/signal-engine.facade.js';
import {
  buildCrossDomainSection,
  crossDomainHasActivity,
  type ReviewSection,
} from './cross-domain-section.js';
import { contributionHasActivity, type ReviewContext, reviewContributionSchema } from './review-contributor.js';
import { ReviewRegistryService } from './review-registry.service.js';

export interface CollectedReview {
  sections: ReviewSection[];
  /** Whether the user did anything at all in the period (a failed section never counts). */
  hasActivity: boolean;
}

@Injectable()
export class ReviewCollectorService {
  private readonly logger = new Logger(ReviewCollectorService.name);

  constructor(
    private readonly registry: ReviewRegistryService,
    private readonly signalEngine: SignalEngineFacade,
    private readonly config: ConfigService,
  ) {}

  /**
   * Every registered domain in parallel, each under its own timeout, then the
   * built-in cross-domain section. A domain that fails or is too slow becomes an
   * `error`/`timeout` section rather than failing the review.
   */
  async collect(context: ReviewContext): Promise<CollectedReview> {
    const timeoutMs = this.config.get<number>('REVIEW_CONTRIBUTOR_TIMEOUT_MS', 10_000);

    const domainResults = await Promise.all(
      this.registry.list().map(async ({ domain, contributor }) => {
        const outcome = await runWithTimeout(() => contributor.collect(context), timeoutMs);
        // Ids only in the logs: metrics and highlights are user data.
        if (outcome.status !== 'ok') {
          this.logger.warn(`Review contributor "${domain}" ${outcome.status} for user ${context.userId}`);
          return { section: { domain, status: outcome.status } satisfies ReviewSection, active: false };
        }
        const parsed = reviewContributionSchema.safeParse(outcome.value);
        if (!parsed.success) {
          this.logger.warn(`Review contributor "${domain}" returned a malformed result for user ${context.userId}`);
          return { section: { domain, status: 'error' } satisfies ReviewSection, active: false };
        }
        return {
          section: {
            domain,
            status: 'ok',
            metrics: parsed.data.metrics,
            highlights: parsed.data.highlights,
          } satisfies ReviewSection,
          active: contributionHasActivity(parsed.data),
        };
      }),
    );

    const counts = await this.signalEngine.activityCounts(context.userId, context.periodStart, context.periodEnd);
    const crossDomain = buildCrossDomainSection(counts);

    return {
      sections: [...domainResults.map((result) => result.section), crossDomain],
      hasActivity: domainResults.some((result) => result.active) || crossDomainHasActivity(crossDomain),
    };
  }
}
