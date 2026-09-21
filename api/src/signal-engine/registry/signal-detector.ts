import { SetMetadata } from '@nestjs/common';

export const SIGNAL_DETECTOR_METADATA = 'signal_engine:signal_detector';

export interface SignalDetectorOptions {
  name: string;
  /** Standard cron expression, passed straight to @nestjs/schedule's CronJob. */
  cron: string;
}

export interface SignalDetector {
  run(): Promise<void>;
}

/**
 * Marks a provider as a time-based signal detector (e.g. bill due, missed
 * tasks). The engine runs it on `cron`, wrapped in a Postgres transaction-scoped
 * advisory lock keyed by `name` so multiple API instances never double-run it.
 */
export const SignalDetector = (options: SignalDetectorOptions): ClassDecorator =>
  SetMetadata(SIGNAL_DETECTOR_METADATA, options);
