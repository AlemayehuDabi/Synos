import { Injectable, Logger } from '@nestjs/common';

/**
 * Runs export jobs in-process. The interface is the seam for swapping to a real
 * queue (e.g. BullMQ) later without touching DataExportService - callers only
 * ever see `run(task)`, never how the task actually gets executed.
 */
export abstract class JobRunner {
  abstract run(task: () => Promise<void>): void;
}

@Injectable()
export class InProcessJobRunner extends JobRunner {
  private readonly logger = new Logger(InProcessJobRunner.name);

  run(task: () => Promise<void>): void {
    void task().catch((error: unknown) => {
      this.logger.error('Export job failed', error instanceof Error ? error.stack : String(error));
    });
  }
}
