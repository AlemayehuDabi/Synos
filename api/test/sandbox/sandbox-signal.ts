import { z } from 'zod';
import { registerSignalType } from '../../src/signal-engine/catalog/signals.js';
import { SignalDomain } from '../../src/generated/prisma/enums.js';

/**
 * A fake signal type registered the same way a future domain module would
 * register its own (see catalog/signals.ts#registerSignalType). Not wired
 * into any connection's sourceSignals (connections are fixed, see
 * catalog/connections.ts), so it is exercised by catalog/registry unit tests;
 * end-to-end suggestion-pipeline tests use the real "bill.due" signal with
 * the sandbox rule/handlers below standing in for the not-yet-built domains.
 */
export const SANDBOX_SIGNAL_TYPE = 'sandbox.test_event';

export function registerSandboxSignalType(): void {
  try {
    registerSignalType(SANDBOX_SIGNAL_TYPE, {
      sourceDomain: SignalDomain.system,
      schemaVersion: 1,
      payloadSchema: z.object({ message: z.string().min(1) }),
    });
  } catch {
    // Already registered in this process (e.g. imported by more than one spec
    // file sharing a module cache) - fine, the registration is idempotent in effect.
  }
}
