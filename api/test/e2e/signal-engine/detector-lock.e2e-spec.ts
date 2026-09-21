import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DetectorRunnerService } from '../../../src/signal-engine/bus/detector-runner.service.js';
import { SANDBOX_DETECTOR_NAME, sandboxDetectorRunCount } from '../../sandbox/sandbox-detector.js';
import { createEngineTestApp } from './support.js';

describe('Signal engine: detector advisory lock (e2e)', () => {
  let app: INestApplication;
  let runner: DetectorRunnerService;

  beforeAll(async () => {
    ({ app } = await createEngineTestApp());
    runner = app.get(DetectorRunnerService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs a detector only once when two instances try to run it at the same time', async () => {
    const before = sandboxDetectorRunCount.value;

    await Promise.all([
      runner.runDetectorForTesting(SANDBOX_DETECTOR_NAME),
      runner.runDetectorForTesting(SANDBOX_DETECTOR_NAME),
    ]);

    expect(sandboxDetectorRunCount.value - before).toBe(1);
  });

  it('allows a later run once the previous one has finished', async () => {
    const before = sandboxDetectorRunCount.value;

    await runner.runDetectorForTesting(SANDBOX_DETECTOR_NAME);

    expect(sandboxDetectorRunCount.value - before).toBe(1);
  });
});
