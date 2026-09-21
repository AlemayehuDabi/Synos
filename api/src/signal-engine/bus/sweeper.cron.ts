import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../lib/prisma.js';
import { SignalProcessorService } from './signal-processor.service.js';

const BATCH_SIZE = 100;
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000;

/**
 * Durable fallback for the transactional-outbox path and for fast-path
 * failures. Claims a batch with SELECT ... FOR UPDATE SKIP LOCKED (safe across
 * multiple API instances sharing the database) and bumps attempts/backoff for
 * the whole claimed batch in the same short transaction, before processing
 * each one individually - so a crash mid-batch only affects the signals that
 * were actually mid-flight, not the ones after them.
 */
@Injectable()
export class SweeperCron {
  private readonly logger = new Logger(SweeperCron.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: SignalProcessorService,
  ) {}

  @Cron('*/30 * * * * *')
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const claimed = await this.claimBatch();
      for (const id of claimed) {
        try {
          await this.processor.processSignal(id);
        } catch (error) {
          await this.recordFailure(id, error);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async claimBatch(): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; attempts: number }[]>`
        SELECT id, attempts FROM signals
        WHERE "processedAt" IS NULL
          AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now())
          AND attempts < ${MAX_ATTEMPTS}
        ORDER BY "occurredAt" ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length === 0) return [];

      for (const row of rows) {
        await tx.signal.update({
          where: { id: row.id },
          data: {
            attempts: row.attempts + 1,
            nextAttemptAt: new Date(Date.now() + BASE_BACKOFF_MS * 2 ** row.attempts),
          },
        });
      }
      return rows.map((row) => row.id);
    });
  }

  private async recordFailure(id: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.prisma.signal.update({ where: { id }, data: { lastError: message } }).catch(() => {});
    this.logger.warn(`Signal ${id} processing failed and will retry with backoff`);
  }
}
