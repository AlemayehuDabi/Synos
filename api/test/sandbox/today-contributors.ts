import { Injectable, Module } from '@nestjs/common';
import { TodayContributor, type TodayContext, type TodayContribution } from '../../src/today/today-contributor.js';
import { sandboxState, sleep } from './sandbox-state.js';

/**
 * Records the context it was handed, so specs can check the date and timezone. Uses
 * 'fitness', the one SignalDomain none of the other fixtures here or the real Calendar
 * and Tasks modules' own @TodayContributor('calendar')/@TodayContributor('tasks') claim.
 */
@Injectable()
@TodayContributor('fitness')
export class SandboxFitnessToday implements TodayContributor {
  async collect(context: TodayContext): Promise<TodayContribution> {
    sandboxState.todayContexts.push(context);
    return { summary: { events: 0 }, items: [] };
  }
}

/** Always throws, with a message a log line must never repeat. */
@Injectable()
@TodayContributor('habits')
export class SandboxHabitsToday implements TodayContributor {
  async collect(): Promise<TodayContribution> {
    throw new Error('SECRET-HABIT-PAYLOAD');
  }
}

/** Far slower than TODAY_CONTRIBUTOR_TIMEOUT_MS. */
@Injectable()
@TodayContributor('finances')
export class SandboxFinancesToday implements TodayContributor {
  async collect(): Promise<TodayContribution> {
    await sleep(5_000);
    return { summary: { billsDue: 1 }, items: [] };
  }
}

/** Answers, but not in the required shape. */
@Injectable()
@TodayContributor('meals')
export class SandboxMealsToday implements TodayContributor {
  async collect(): Promise<TodayContribution> {
    return { summary: 'not an object', items: [{ id: 'no-title' }] } as unknown as TodayContribution;
  }
}

/** Four fake domains: one healthy, one throwing, one too slow, one malformed. */
@Module({
  providers: [SandboxFitnessToday, SandboxHabitsToday, SandboxFinancesToday, SandboxMealsToday],
})
export class SandboxTodayModule {}
