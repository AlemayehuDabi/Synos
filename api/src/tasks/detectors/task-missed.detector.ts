import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.js';
import { SignalDetector } from '../../signal-engine/registry/index.js';
import { SignalEngineFacade } from '../../signal-engine/signal-engine.facade.js';

/** How many overdue tasks one tick will emit for; the rest are picked up on the next tick. */
const BATCH_SIZE = 500;

/**
 * Emits `task.missed` for every open task whose `dueAt` has passed. Never double-emits for
 * the same occurrence: the signal's own `dedupeKey` (task id + that exact dueAt) makes a
 * repeat emit for an unchanged, still-open, still-overdue task a no-op at the engine level
 * (see SignalsService.persist), and once `dueAt` itself moves - skipped, completed, or
 * rolled forward to the next occurrence - the dedupeKey changes with it.
 */
@Injectable()
@SignalDetector({ name: 'tasks-missed', cron: '0 */15 * * * *' })
export class TaskMissedDetector implements SignalDetector {
  private readonly logger = new Logger(TaskMissedDetector.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signalEngine: SignalEngineFacade,
  ) {}

  async run(): Promise<void> {
    const overdue = await this.prisma.task.findMany({
      where: { status: 'open', deletedAt: null, dueAt: { lt: new Date() } },
      select: { id: true, userId: true, dueAt: true, recurringGroupId: true },
      take: BATCH_SIZE,
    });

    for (const task of overdue) {
      try {
        await this.signalEngine.emit({
          userId: task.userId,
          type: 'task.missed',
          payload: {
            taskId: task.id,
            dueAt: task.dueAt!.toISOString(),
            ...(task.recurringGroupId ? { recurringGroupId: task.recurringGroupId } : {}),
          },
          dedupeKey: `task-missed:${task.id}:${task.dueAt!.toISOString()}`,
        });
      } catch (error) {
        // Ids only: never log task content.
        this.logger.warn(`Could not emit task.missed for task ${task.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}
