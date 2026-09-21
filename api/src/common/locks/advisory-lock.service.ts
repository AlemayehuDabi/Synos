import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.js';

const DEFAULT_MAX_HOLD_MS = 15 * 60 * 1000;

/**
 * Cross-instance mutual exclusion on a Postgres advisory lock.
 *
 * The lock is transaction-scoped (pg_try_advisory_xact_lock) rather than
 * session-scoped: with a pooled driver adapter a session lock and its unlock
 * could land on different physical connections. It is held for as long as the
 * wrapping transaction is open, and Prisma closes an interactive transaction
 * after its `timeout` (5 seconds by default) - which would silently release the
 * lock mid-run - so the timeout is raised to `maxHoldMs`.
 */
@Injectable()
export class AdvisoryLockService {
  constructor(private readonly prisma: PrismaService) {}

  /** Runs `work` only if nobody else holds `name`. Returns false, without running it, when someone does. */
  async runExclusive(name: string, work: () => Promise<void>, maxHoldMs = DEFAULT_MAX_HOLD_MS): Promise<boolean> {
    let ran = false;
    await this.prisma.$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext(${name})::bigint) AS locked
        `;
        if (!row?.locked) return;
        ran = true;
        await work();
      },
      { timeout: maxHoldMs, maxWait: 5_000 },
    );
    return ran;
  }
}
