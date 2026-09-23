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

/** Far slower than TODAY_CONTRIBUTOR_TIMEOUT_MS. */
@Injectable()
@TodayContributor('finances')
export class SandboxFinancesToday implements TodayContributor {
  async collect(): Promise<TodayContribution> {
    await sleep(5_000);
    return { summary: { billsDue: 1 }, items: [] };
  }
}

/**
 * Always throws, with a message a log line must never repeat. Was
 * @TodayContributor('habits') until the Habits module supplied a real one;
 * 'meals' is the one remaining SignalDomain with no real contributor yet.
 */
@Injectable()
@TodayContributor('meals')
export class SandboxMealsToday implements TodayContributor {
  async collect(): Promise<TodayContribution> {
    throw new Error('SECRET-MEALS-PAYLOAD');
  }
}

/** Three fake domains: one healthy, one too slow, one throwing. */
@Module({
  providers: [SandboxFitnessToday, SandboxFinancesToday, SandboxMealsToday],
})
export class SandboxTodayModule {}
