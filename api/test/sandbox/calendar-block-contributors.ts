import { Injectable, Module } from '@nestjs/common';
import {
  CalendarBlockContributor,
  type Block,
  type CalendarBlockContext,
  type CalendarBlockContributor as CalendarBlockContributorInterface,
} from '../../src/calendar/calendar-block-contributor.js';
import { sandboxState, sleep } from './sandbox-state.js';

/**
 * Healthy: returns whatever blocks the test has seeded for the user, and records the
 * context it was handed. Uses 'system', the one SignalDomain no real module claims - the
 * real Tasks and Fitness modules supply @CalendarBlockContributor('tasks')/('fitness').
 */
@Injectable()
@CalendarBlockContributor('system')
export class SandboxSystemBlocks implements CalendarBlockContributorInterface {
  async collect(context: CalendarBlockContext): Promise<Block[]> {
    sandboxState.calendarBlockContexts.push(context);
    return sandboxState.calendarBlocksByUser.get(context.userId) ?? [];
  }
}

/** Always throws, with a message a log line must never repeat. */
@Injectable()
@CalendarBlockContributor('habits')
export class SandboxHabitsBlocks implements CalendarBlockContributorInterface {
  async collect(): Promise<Block[]> {
    throw new Error('SECRET-BLOCK-PAYLOAD');
  }
}

/** Far slower than CALENDAR_CONTRIBUTOR_TIMEOUT_MS. */
@Injectable()
@CalendarBlockContributor('finances')
export class SandboxFinancesBlocks implements CalendarBlockContributorInterface {
  async collect(): Promise<Block[]> {
    await sleep(5_000);
    return [];
  }
}

/** Answers, but not in the required shape. */
@Injectable()
@CalendarBlockContributor('meals')
export class SandboxMealsBlocks implements CalendarBlockContributorInterface {
  async collect(): Promise<Block[]> {
    return [{ id: 'no-title' } as unknown as Block];
  }
}

/** One healthy domain only - most specs just need a controllable source of blocks. */
@Module({ providers: [SandboxSystemBlocks] })
export class SandboxCalendarBlockModule {}

/** Adds a throwing, a too-slow and a malformed domain on top of SandboxCalendarBlockModule. */
@Module({ providers: [SandboxHabitsBlocks, SandboxFinancesBlocks, SandboxMealsBlocks] })
export class SandboxCalendarBlockFaultsModule {}
