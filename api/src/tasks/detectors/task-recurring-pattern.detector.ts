import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { localDateInTimezone } from '../../common/time/timezone.js';
import { PrismaService } from '../../lib/prisma.js';
import { averageCadenceDays, taskFingerprint } from '../pattern-fingerprint.js';
import { SignalDetector } from '../../signal-engine/registry/index.js';
import { SignalEngineFacade } from '../../signal-engine/signal-engine.facade.js';

/** `task-pattern:<fingerprint>` - the targetKey a future recurring-task-to-habit rule's suggestion would use. */
export const patternTargetKey = (fingerprint: string): string => `task-pattern:${fingerprint}`;

/**
 * Notices the same (non-recurring) task title being created over and over and emits
 * `task.recurring_pattern` so a future habits/recurring-task-to-habit rule can offer to
 * turn it into a real recurring series. Never re-fires while a suggestion for the same
 * fingerprint is still `pending` or `dismissed` within the window - once dismissed, the
 * user has already said no for now; once approved/auto-applied/superseded/expired, a new
 * pattern of fresh occurrences is free to suggest again.
 */
@Injectable()
@SignalDetector({ name: 'tasks-recurring-pattern', cron: '0 30 4 * * *' })
export class TaskRecurringPatternDetector implements SignalDetector {
  private readonly logger = new Logger(TaskRecurringPatternDetector.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signalEngine: SignalEngineFacade,
    private readonly config: ConfigService,
  ) {}

  async run(): Promise<void> {
    const minOccurrences = this.config.get<number>('TASKS_PATTERN_MIN_OCCURRENCES', 3);
    const windowDays = this.config.get<number>('TASKS_PATTERN_WINDOW_DAYS', 60);
    const since = new Date(Date.now() - windowDays * 86_400_000);

    const candidates = await this.prisma.task.findMany({
      where: { rrule: null, deletedAt: null, createdAt: { gte: since } },
      select: { id: true, userId: true, title: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const groups = new Map<string, { userId: string; fingerprint: string; ids: string[]; createdAt: Date[] }>();
    for (const task of candidates) {
      const fingerprint = taskFingerprint(task.title);
      const key = `${task.userId}\u0000${fingerprint}`;
      const group = groups.get(key) ?? { userId: task.userId, fingerprint, ids: [], createdAt: [] };
      group.ids.push(task.id);
      group.createdAt.push(task.createdAt);
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      if (group.ids.length < minOccurrences) continue;
      // eslint-disable-next-line no-await-in-loop
      await this.emitIfDue(group, since);
    }
  }

  private async emitIfDue(group: { userId: string; fingerprint: string; ids: string[]; createdAt: Date[] }, since: Date): Promise<void> {
    const alreadySuggested = await this.prisma.suggestion.findFirst({
      where: { userId: group.userId, targetKey: patternTargetKey(group.fingerprint), status: { in: ['pending', 'dismissed'] }, createdAt: { gte: since } },
      select: { id: true },
    });
    if (alreadySuggested) return;

    const cadenceDays = averageCadenceDays(group.createdAt);
    const timezone = 'UTC'; // only used to bucket at most one emission per day; wall-clock precision is not needed here
    const today = localDateInTimezone(new Date(), timezone);

    try {
      await this.signalEngine.emit({
        userId: group.userId,
        type: 'task.recurring_pattern',
        payload: { fingerprint: group.fingerprint, occurrences: group.ids.length, cadenceDays, taskIds: group.ids },
        dedupeKey: `task-recurring-pattern:${group.fingerprint}:${today}`,
      });
    } catch (error) {
      this.logger.warn(`Could not emit task.recurring_pattern: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
