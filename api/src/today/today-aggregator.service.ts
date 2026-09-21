import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { runWithTimeout } from '../common/async/run-with-timeout.js';
import type { SignalDomain } from '../generated/prisma/enums.js';
import {
  type TodayContext,
  todayContributionSchema,
  type TodayContributor,
  type TodayItem,
} from './today-contributor.js';
import { TodayRegistryService } from './today-registry.service.js';

export type TodaySection =
  | { domain: SignalDomain; status: 'ok'; summary: Record<string, unknown>; items: TodayItem[] }
  | { domain: SignalDomain; status: 'error' | 'timeout' };

@Injectable()
export class TodayAggregatorService {
  private readonly logger = new Logger(TodayAggregatorService.name);

  constructor(
    private readonly registry: TodayRegistryService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Asks every registered contributor at the same time, each under its own
   * timeout. One that throws, returns garbage or is too slow only marks its own
   * section as `error`/`timeout`; it can never fail the whole call.
   */
  async collect(context: TodayContext): Promise<TodaySection[]> {
    const timeoutMs = this.config.get<number>('TODAY_CONTRIBUTOR_TIMEOUT_MS', 1500);
    return Promise.all(
      this.registry
        .list()
        .map(({ domain, contributor }) => this.collectOne(domain, contributor, context, timeoutMs)),
    );
  }

  private async collectOne(
    domain: SignalDomain,
    contributor: TodayContributor,
    context: TodayContext,
    timeoutMs: number,
  ): Promise<TodaySection> {
    const outcome = await runWithTimeout(() => contributor.collect(context), timeoutMs);

    // Ids only in the logs: what a contributor returns is user data and is never logged.
    if (outcome.status === 'timeout') {
      this.logger.warn(`Today contributor "${domain}" timed out for user ${context.userId}`);
      return { domain, status: 'timeout' };
    }
    if (outcome.status === 'error') {
      this.logger.warn(`Today contributor "${domain}" failed for user ${context.userId}`);
      return { domain, status: 'error' };
    }
    const parsed = todayContributionSchema.safeParse(outcome.value);
    if (!parsed.success) {
      this.logger.warn(`Today contributor "${domain}" returned a malformed result for user ${context.userId}`);
      return { domain, status: 'error' };
    }
    return { domain, status: 'ok', summary: parsed.data.summary, items: parsed.data.items as TodayItem[] };
  }
}
