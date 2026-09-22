import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { runWithTimeout } from '../common/async/run-with-timeout.js';
import type { SignalDomain } from '../generated/prisma/enums.js';
import { blockSchema, type Block, type CalendarBlockContext, type CalendarBlockContributor } from './calendar-block-contributor.js';
import { CalendarBlockRegistryService } from './calendar-block-registry.service.js';

export type ContributorSection =
  | { domain: SignalDomain; status: 'ok'; blocks: Block[] }
  | { domain: SignalDomain; status: 'error' | 'timeout' };

@Injectable()
export class CalendarBlockAggregatorService {
  private readonly logger = new Logger(CalendarBlockAggregatorService.name);

  constructor(
    private readonly registry: CalendarBlockRegistryService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Asks every registered domain for its soft blocks in parallel, each under its own
   * timeout. One that throws, returns garbage or is too slow only marks its own section
   * as `error`/`timeout`; it can never fail the whole view/free-slots request.
   */
  async collect(context: CalendarBlockContext): Promise<ContributorSection[]> {
    const timeoutMs = this.config.get<number>('CALENDAR_CONTRIBUTOR_TIMEOUT_MS', 1500);
    return Promise.all(
      this.registry.list().map(({ domain, contributor }) => this.collectOne(domain, contributor, context, timeoutMs)),
    );
  }

  private async collectOne(
    domain: SignalDomain,
    contributor: CalendarBlockContributor,
    context: CalendarBlockContext,
    timeoutMs: number,
  ): Promise<ContributorSection> {
    const outcome = await runWithTimeout(() => contributor.collect(context), timeoutMs);

    // Ids only in the logs: what a contributor returns is user data and is never logged.
    if (outcome.status === 'timeout') {
      this.logger.warn(`Calendar block contributor "${domain}" timed out for user ${context.userId}`);
      return { domain, status: 'timeout' };
    }
    if (outcome.status === 'error') {
      this.logger.warn(`Calendar block contributor "${domain}" failed for user ${context.userId}`);
      return { domain, status: 'error' };
    }
    const parsed = blockSchema.array().safeParse(outcome.value);
    if (!parsed.success) {
      this.logger.warn(`Calendar block contributor "${domain}" returned a malformed result for user ${context.userId}`);
      return { domain, status: 'error' };
    }
    const blocks = parsed.data.map((block) => ({ ...block, startsAt: new Date(block.startsAt), endsAt: new Date(block.endsAt) }));
    return { domain, status: 'ok', blocks: blocks as Block[] };
  }
}
