import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { AdvisoryLockService } from '../../common/locks/advisory-lock.service.js';
import { SignalRegistryService } from '../registry/registry.service.js';
import type { SignalDetector } from '../registry/signal-detector.js';

/**
 * Schedules every discovered @SignalDetector on its own cron expression
 * (registered dynamically via SchedulerRegistry, since decorators can't carry
 * a per-instance cron string known only at runtime). Each tick is wrapped in
 * the shared advisory lock (see AdvisoryLockService) keyed by the detector's
 * name, so two API instances never run the same detector at
 * the same time - only one instance's lock attempt succeeds per tick.
 */
@Injectable()
export class DetectorRunnerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DetectorRunnerService.name);

  constructor(
    private readonly registry: SignalRegistryService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly locks: AdvisoryLockService,
  ) {}

  onApplicationBootstrap(): void {
    for (const { options, instance } of this.registry.getDetectors()) {
      const job = CronJob.from({
        cronTime: options.cron,
        onTick: () => this.runWithLock(options.name, instance),
      });
      this.schedulerRegistry.addCronJob(`signal-detector:${options.name}`, job);
      job.start();
      this.logger.log(`Scheduled detector "${options.name}" on "${options.cron}"`);
    }
  }

  /** Test hook: triggers one detector's lock-guarded run outside of its cron schedule. */
  async runDetectorForTesting(name: string): Promise<void> {
    const detector = this.registry.getDetectors().find((d) => d.options.name === name);
    if (!detector) throw new Error(`No detector registered with name "${name}"`);
    await this.runWithLock(name, detector.instance);
  }

  private async runWithLock(name: string, instance: SignalDetector): Promise<void> {
    try {
      const ran = await this.locks.runExclusive(`signal_detector:${name}`, () => instance.run());
      if (!ran) {
        this.logger.debug(`Detector "${name}" already running elsewhere; skipping this tick`);
      }
    } catch (error) {
      this.logger.error(`Detector "${name}" failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
