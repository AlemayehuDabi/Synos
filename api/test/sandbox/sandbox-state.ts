import type { Block, CalendarBlockContext } from '../../src/calendar/calendar-block-contributor.js';
import type { ReviewContext } from '../../src/reviews/review-contributor.js';
import type { TodayContext } from '../../src/today/today-contributor.js';

/**
 * The fake domains' "database": how many tasks each user completed, plus the
 * contexts the contributors were called with, so specs can assert what they were
 * handed. One instance per test process (each spec file runs in its own).
 */
export const sandboxState = {
  tasksByUser: new Map<string, number>(),
  todayContexts: [] as TodayContext[],
  reviewContexts: [] as ReviewContext[],
  calendarBlocksByUser: new Map<string, Block[]>(),
  calendarBlockContexts: [] as CalendarBlockContext[],
  reset(): void {
    this.tasksByUser.clear();
    this.todayContexts.length = 0;
    this.reviewContexts.length = 0;
    this.calendarBlocksByUser.clear();
    this.calendarBlockContexts.length = 0;
  },
};

/** Resolves after `ms` without keeping the process alive if nothing else is running. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });
}
