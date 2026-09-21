import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SuggestionsService } from '../../src/signal-engine/services/suggestions.service.js';

const paramsSchema = z.object({ billId: z.string() });

function createTx() {
  return {
    suggestion: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn(),
    },
    activityLog: { updateMany: vi.fn() },
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
  };
}

function pendingSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    userId: 'u1',
    signalId: 'sig1',
    connectionId: 'bill-to-reminder',
    targetDomain: 'tasks',
    actionType: 'sandbox.apply-ok',
    params: { billId: 'b1' },
    originalParams: null,
    status: 'pending',
    revertData: { billId: 'b1' },
    signal: null,
    ...overrides,
  };
}

describe('SuggestionsService transitions', () => {
  let tx: ReturnType<typeof createTx>;
  let prisma: {
    suggestion: { findFirst: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; findUniqueOrThrow: ReturnType<typeof vi.fn> };
    activityLog: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let activity: { log: ReturnType<typeof vi.fn> };
  let registry: { getHandler: ReturnType<typeof vi.fn> };
  let config: { get: ReturnType<typeof vi.fn> };
  let service: SuggestionsService;

  beforeEach(() => {
    tx = createTx();
    prisma = {
      suggestion: { findFirst: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
      activityLog: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(async (callback: (client: unknown) => unknown) => callback(tx)),
    };
    activity = { log: vi.fn().mockResolvedValue(undefined) };
    registry = { getHandler: vi.fn() };
    config = { get: vi.fn((_key: string, fallback: unknown) => fallback) };
    service = new SuggestionsService(prisma as never, activity as never, registry as never, config as never);
  });

  describe('approve', () => {
    function setup(applyResult: unknown) {
      const suggestion = pendingSuggestion();
      // first read (validation), then getInboxItem's read after the transaction
      prisma.suggestion.findFirst.mockResolvedValue(suggestion);
      tx.suggestion.updateMany.mockResolvedValue({ count: 1 });
      const apply = vi.fn(async () => {
        if (applyResult instanceof Error) throw applyResult;
        return applyResult;
      });
      registry.getHandler.mockReturnValue({ paramsSchema, apply });
      return { apply };
    }

    it('claims the suggestion, applies it, stores revertData, and logs the approval', async () => {
      setup({ outcome: 'applied', entityRef: { type: 't', id: 'x' }, after: { ok: true }, revertData: { undo: 1 } });

      await service.approve('u1', 's1');

      expect(tx.suggestion.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', userId: 'u1', status: 'pending' },
        data: expect.objectContaining({ status: 'approved', resolvedBy: 'user' }),
      });
      expect(tx.suggestion.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { revertData: { undo: 1 } } });
      expect(activity.log).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'suggestion_approved', after: { ok: true } }),
        tx,
      );
    });

    it('wraps the handler in a savepoint and releases it on success', async () => {
      setup({ outcome: 'applied', entityRef: { type: 't', id: 'x' } });

      await service.approve('u1', 's1');

      expect(tx.$executeRawUnsafe.mock.calls.map((c) => c[0])).toEqual([
        'SAVEPOINT handler_apply',
        'RELEASE SAVEPOINT handler_apply',
      ]);
    });

    it('logs the edit as well when params are supplied with the approval', async () => {
      setup({ outcome: 'applied', entityRef: { type: 't', id: 'x' } });

      await service.approve('u1', 's1', { billId: 'edited' });

      const kinds = activity.log.mock.calls.map((c) => (c[0] as { kind: string }).kind);
      expect(kinds).toEqual(['suggestion_edited', 'suggestion_approved']);
    });

    it('rolls back the handler\'s writes and supersedes on a conflict, then answers 409', async () => {
      setup({ outcome: 'conflict', reason: 'changed underneath us' });

      await expect(service.approve('u1', 's1')).rejects.toMatchObject({ status: 409 });

      expect(tx.$executeRawUnsafe.mock.calls.map((c) => c[0])).toEqual([
        'SAVEPOINT handler_apply',
        'ROLLBACK TO SAVEPOINT handler_apply',
      ]);
      expect(tx.suggestion.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: expect.objectContaining({ status: 'superseded', supersededReason: 'changed underneath us' }),
      });
      expect(activity.log).toHaveBeenCalledWith(expect.objectContaining({ kind: 'superseded' }), tx);
    });

    it('treats a noop like a conflict (nothing left to apply, so it cannot stay pending)', async () => {
      setup({ outcome: 'noop', reason: 'already done' });

      await expect(service.approve('u1', 's1')).rejects.toMatchObject({ status: 409 });
      expect(tx.suggestion.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: expect.objectContaining({ status: 'superseded' }),
      });
    });

    it('marks the suggestion failed and answers 422 when the handler throws', async () => {
      setup(new Error('handler blew up'));
      prisma.suggestion.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.approve('u1', 's1')).rejects.toMatchObject({ status: 422 });

      expect(tx.$executeRawUnsafe.mock.calls.map((c) => c[0])).toContain('ROLLBACK TO SAVEPOINT handler_apply');
      // recorded outside the (rolled back) transaction, gated on still being pending
      expect(prisma.suggestion.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', userId: 'u1', status: 'pending' },
        data: expect.objectContaining({ status: 'failed', failureNote: 'handler blew up' }),
      });
      expect(activity.log).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'suggestion_approved' }), expect.anything());
    });

    it('answers 409 without running the handler when another caller already claimed it', async () => {
      const { apply } = setup({ outcome: 'applied', entityRef: { type: 't', id: 'x' } });
      tx.suggestion.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approve('u1', 's1')).rejects.toMatchObject({ status: 409 });
      expect(apply).not.toHaveBeenCalled();
    });

    it('rejects invalid edited params with 422 before claiming anything', async () => {
      setup({ outcome: 'applied', entityRef: { type: 't', id: 'x' } });

      await expect(service.approve('u1', 's1', { billId: 42 })).rejects.toMatchObject({ status: 422 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('applyAuto', () => {
    function setup(applyResult: unknown) {
      tx.suggestion.findUniqueOrThrow.mockResolvedValue(pendingSuggestion());
      const apply = vi.fn(async () => {
        if (applyResult instanceof Error) throw applyResult;
        return applyResult;
      });
      registry.getHandler.mockReturnValue({ paramsSchema, apply });
    }

    it('marks the suggestion auto_applied with revertData and logs auto_applied', async () => {
      setup({ outcome: 'applied', entityRef: { type: 't', id: 'x' }, before: null, after: { ok: 1 }, revertData: { r: 1 } });

      await service.applyAuto(tx as never, 's1');

      expect(tx.suggestion.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: expect.objectContaining({ status: 'auto_applied', resolvedBy: 'system', revertData: { r: 1 } }),
      });
      expect(activity.log).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'auto_applied', before: null, after: { ok: 1 } }),
        tx,
      );
    });

    it('supersedes with the reason on a conflict', async () => {
      setup({ outcome: 'conflict', reason: 'manual value present' });

      await service.applyAuto(tx as never, 's1');

      expect(tx.suggestion.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: expect.objectContaining({ status: 'superseded', supersededReason: 'manual value present' }),
      });
      expect(activity.log).toHaveBeenCalledWith(expect.objectContaining({ kind: 'superseded' }), tx);
    });

    it.each([
      ['a noop', { outcome: 'noop', reason: 'nothing to do' }, 'nothing to do'],
      ['a thrown error', new Error('kaboom'), 'kaboom'],
    ])('downgrades to a pending suggestion with a failureNote on %s, and never throws', async (_name, result, note) => {
      setup(result);

      await expect(service.applyAuto(tx as never, 's1')).resolves.toBeUndefined();

      expect(tx.suggestion.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { failureNote: note } });
      expect(activity.log).toHaveBeenCalledWith(expect.objectContaining({ kind: 'suggestion_created' }), tx);
      expect(tx.$executeRawUnsafe.mock.calls.map((c) => c[0])).toContain('ROLLBACK TO SAVEPOINT handler_apply');
    });
  });

  describe('undoActivity', () => {
    const approvalEntry = {
      id: 'a1',
      userId: 'u1',
      suggestionId: 's1',
      kind: 'suggestion_approved',
      undoneAt: null,
      createdAt: new Date(),
    };

    function setup(overrides: { handler?: unknown; entry?: Record<string, unknown>; suggestion?: Record<string, unknown> } = {}) {
      prisma.activityLog.findFirst.mockResolvedValue({ ...approvalEntry, ...overrides.entry });
      prisma.suggestion.findFirst.mockResolvedValue(pendingSuggestion({ status: 'approved', ...overrides.suggestion }));
      const revert = vi.fn().mockResolvedValue({ outcome: 'reverted' });
      registry.getHandler.mockReturnValue(overrides.handler ?? { supportsRevert: true, revert });
      tx.suggestion.updateMany.mockResolvedValue({ count: 1 });
      tx.activityLog.updateMany.mockResolvedValue({ count: 1 });
      return { revert };
    }

    it('reverts once, claiming the suggestion and the activity entry first', async () => {
      const { revert } = setup();

      await service.undoActivity('u1', 'a1');

      expect(tx.suggestion.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', userId: 'u1', status: { in: ['approved', 'auto_applied'] } },
        data: { status: 'reverted' },
      });
      expect(tx.activityLog.updateMany).toHaveBeenCalledWith({
        where: { id: 'a1', userId: 'u1', undoneAt: null },
        data: { undoneAt: expect.any(Date) },
      });
      expect(revert).toHaveBeenCalledTimes(1);
      expect(activity.log).toHaveBeenCalledWith(expect.objectContaining({ kind: 'reverted' }), tx);
    });

    it('answers 409 and never calls revert when a concurrent undo already claimed the action', async () => {
      const { revert } = setup();
      tx.activityLog.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.undoActivity('u1', 'a1')).rejects.toMatchObject({ status: 409 });
      expect(revert).not.toHaveBeenCalled();
    });

    it('answers 409 when the handler reports the target changed since apply', async () => {
      const { revert } = setup();
      revert.mockResolvedValue({ outcome: 'conflict', reason: 'target edited' });

      await expect(service.undoActivity('u1', 'a1')).rejects.toMatchObject({ status: 409 });
    });

    it.each([
      ['a suggestion_created entry', { kind: 'suggestion_created' }],
      ['a manual_override entry', { kind: 'manual_override' }],
      ['an entry with no suggestion', { suggestionId: null }],
    ])('refuses to undo %s (422)', async (_name, entry) => {
      const { revert } = setup({ entry });

      await expect(service.undoActivity('u1', 'a1')).rejects.toMatchObject({ status: 422 });
      expect(revert).not.toHaveBeenCalled();
    });

    it('accepts an auto_applied entry', async () => {
      const { revert } = setup({ entry: { kind: 'auto_applied' }, suggestion: { status: 'auto_applied' } });

      await service.undoActivity('u1', 'a1');
      expect(revert).toHaveBeenCalledTimes(1);
    });

    it('answers 409 for an entry that was already undone', async () => {
      setup({ entry: { undoneAt: new Date() } });
      await expect(service.undoActivity('u1', 'a1')).rejects.toMatchObject({ status: 409 });
    });

    it('answers 422 when the handler does not support revert', async () => {
      setup({ handler: { supportsRevert: false } });
      await expect(service.undoActivity('u1', 'a1')).rejects.toMatchObject({ status: 422 });
    });

    it('answers 422 once the undo window has passed', async () => {
      setup({ entry: { createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) } });
      await expect(service.undoActivity('u1', 'a1')).rejects.toMatchObject({ status: 422 });
    });

    it('answers 422 for a suggestion that is not approved or auto-applied', async () => {
      setup({ suggestion: { status: 'reverted' } });
      await expect(service.undoActivity('u1', 'a1')).rejects.toMatchObject({ status: 422 });
    });
  });

  describe('edit', () => {
    it('answers 409 when the suggestion stopped being pending between the read and the write', async () => {
      prisma.suggestion.findFirst.mockResolvedValue(pendingSuggestion());
      registry.getHandler.mockReturnValue({ paramsSchema });
      prisma.suggestion.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.edit('u1', 's1', { billId: 'x' })).rejects.toMatchObject({ status: 409 });
      expect(prisma.suggestion.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 's1', userId: 'u1', status: 'pending' } }),
      );
    });
  });

  describe('supersede / expire only log what they actually moved', () => {
    it('supersedePending logs one entry per row the atomic update returned', async () => {
      (prisma.suggestion as Record<string, unknown>).updateManyAndReturn = vi
        .fn()
        .mockResolvedValue([{ id: 's1', connectionId: 'bill-to-reminder', targetDomain: 'tasks' }]);

      await service.supersedePending('u1', 'sandbox:bill:1', 'manual entry won');

      expect(activity.log).toHaveBeenCalledTimes(1);
      expect(activity.log).toHaveBeenCalledWith(expect.objectContaining({ kind: 'superseded', suggestionId: 's1' }));
    });

    it('expirePending returns and logs only the rows it expired', async () => {
      (prisma.suggestion as Record<string, unknown>).updateManyAndReturn = vi
        .fn()
        .mockResolvedValue([{ id: 's1', userId: 'u1', connectionId: 'bill-to-reminder', targetDomain: 'tasks' }]);

      const count = await service.expirePending();

      expect(count).toBe(1);
      expect(activity.log).toHaveBeenCalledWith(expect.objectContaining({ kind: 'expired', suggestionId: 's1' }));
    });
  });
});
