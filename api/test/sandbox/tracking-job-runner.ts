import { JobRunner } from '../../src/common/jobs/job-runner.js';

/** Runs jobs like the in-process runner, but lets a spec wait until every queued job has finished. */
export class TrackingJobRunner extends JobRunner {
  private readonly pending = new Set<Promise<void>>();

  run(task: () => Promise<void>): void {
    const running = task().catch(() => undefined);
    this.pending.add(running);
    void running.finally(() => this.pending.delete(running));
  }

  /** Resolves once nothing is running, including jobs queued by jobs that were running. */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all(this.pending);
  }
}
