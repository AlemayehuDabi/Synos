import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { SandboxModule } from '../../sandbox/sandbox.module.js';
import { SignalEngineFacade } from '../../../src/signal-engine/signal-engine.facade.js';
import { createTestApp, type SentMail } from '../helpers.js';

export async function createEngineTestApp(): Promise<{
  app: INestApplication;
  sentMails: SentMail[];
  facade: SignalEngineFacade;
}> {
  const { app, sentMails } = await createTestApp([SandboxModule]);
  const facade = app.get(SignalEngineFacade);
  return { app, sentMails, facade };
}

export interface BillDuePayload {
  billId: string;
  dueDate: string;
  amountCents: number;
  currency: string;
  daysUntilDue: number;
}

export function billDuePayload(billId: string): BillDuePayload {
  return { billId, dueDate: '2026-10-01', amountCents: 5000, currency: 'USD', daysUntilDue: 5 };
}

/** Emits a real "bill.due" signal; the sandbox rule picks the fake action type from the billId prefix. */
export async function emitBillDue(facade: SignalEngineFacade, userId: string, prefix = '') {
  const payload = billDuePayload(`${prefix}${randomUUID()}`);
  const signal = await facade.emit({ userId, type: 'bill.due', payload });
  return { signal, payload };
}
