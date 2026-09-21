import { Injectable } from '@nestjs/common';
import { SignalDetector } from '../../src/signal-engine/registry/index.js';

export const SANDBOX_DETECTOR_NAME = 'sandbox-detector';

/** Mutable counter tests read to confirm the advisory lock prevented a double-run. */
export const sandboxDetectorRunCount = { value: 0 };

@Injectable()
@SignalDetector({ name: SANDBOX_DETECTOR_NAME, cron: '0 0 1 1 *' }) // effectively never fires on its own; tests trigger it directly
export class SandboxDetector implements SignalDetector {
  async run(): Promise<void> {
    sandboxDetectorRunCount.value += 1;
    // Hold the "work" open briefly so a concurrent second run has a window to race in.
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
