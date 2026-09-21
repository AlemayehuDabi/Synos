import type { PrismaService } from '../../lib/prisma.js';

/** The Prisma client seen inside `prisma.$transaction(async (tx) => ...)`. */
export type PrismaTransactionClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

export interface EntityRef {
  type: string;
  id: string;
}

export interface ProposalDraft {
  title: string;
  body: string;
  actionType: string;
  params: unknown;
  /** Identifies the thing being changed, e.g. "habit:<id>:2026-09-21". Manual overrides supersede against this. */
  targetKey: string;
  /** Scoped per (userId, connectionId); reprocessing the same signal must produce the same dedupeKey. */
  dedupeKey: string;
  expiresAt?: Date;
}

export interface RuleSignalView {
  id: string;
  type: string;
  payload: unknown;
  occurredAt: Date;
  subjectType: string | null;
  subjectId: string | null;
}

export interface RuleContext {
  userId: string;
  signal: RuleSignalView;
  now: Date;
}

export type ApplyResult =
  | { outcome: 'applied'; entityRef: EntityRef; before?: unknown; after?: unknown; revertData?: unknown }
  | { outcome: 'conflict'; reason: string }
  | { outcome: 'noop'; reason: string };

export type RevertResult = { outcome: 'reverted' } | { outcome: 'conflict'; reason: string };

export interface ActionHandlerContext {
  userId: string;
  tx: PrismaTransactionClient;
  source: 'suggestion' | 'auto';
  suggestionId: string;
}
