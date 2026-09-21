import { Injectable, Module } from '@nestjs/common';
import { TodayContributor, type TodayContext, type TodayContribution } from '../../src/today/today-contributor.js';
import { sandboxState, sleep } from './sandbox-state.js';

/** Healthy: the number of "open tasks" depends on the user, so isolation is observable. */
@Injectable()
@TodayContributor('tasks')
export class SandboxTasksToday implements TodayContributor {
  async collect({ userId, date }: TodayContext): Promise<TodayContribution> {
    const open = sandboxState.tasksByUser.get(userId) ?? 0;
    return {
      summary: { open, date },
      items: Array.from({ length: open }, (_, index) => ({ id: `task-${index + 1}`, title: `Task ${index + 1}`, done: false })),
    };
  }
}

/** Records the context it was handed, so specs can check the date and timezone. */
@Injectable()
@TodayContributor('calendar')
export class SandboxCalendarToday implements TodayContributor {
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

/** Five fake domains: two healthy, one throwing, one too slow, one malformed. */
@Module({
  providers: [SandboxTasksToday, SandboxCalendarToday, SandboxHabitsToday, SandboxFinancesToday, SandboxMealsToday],
})
export class SandboxTodayModule {}
