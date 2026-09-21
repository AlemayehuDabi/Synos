import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SuggestionsService } from '../../src/signal-engine/services/suggestions.service.js';

function createPrismaMock() {
  return {
    suggestion: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    activityLog: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
  };
}

describe('SuggestionsService state machine', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let activityService: { log: ReturnType<typeof vi.fn> };
  let registry: { getHandler: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn> };
  let service: SuggestionsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    activityService = { log: vi.fn().mockResolvedValue(undefined) };
    registry = { getHandler: vi.fn() };
    configService = { get: vi.fn((_key: string, fallback: unknown) => fallback) };
    service = new SuggestionsService(
      prisma as never,
      activityService as never,
      registry as never,
      configService as never,
    );
  });

  describe('dismiss', () => {
    it('dismisses a pending suggestion, records the reason on the activity entry, and logs it', async () => {
      prisma.suggestion.updateMany.mockResolvedValue({ count: 1 });
      prisma.suggestion.findUniqueOrThrow.mockResolvedValue({
        id: 's1',
        connectionId: 'bill-to-reminder',
        targetDomain: 'tasks',
      });
      prisma.suggestion.findFirst.mockResolvedValue({ id: 's1', signal: null });

      await service.dismiss('u1', 's1', 'not relevant');

      expect(prisma.suggestion.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', userId: 'u1', status: 'pending' },
        data: expect.objectContaining({ status: 'dismissed' }),
      });
      expect(activityService.log).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'suggestion_dismissed', after: { reason: 'not relevant' } }),
      );
    });

    it('returns 409 when the suggestion is no longer pending', async () => {
      prisma.suggestion.updateMany.mockResolvedValue({ count: 0 });
      prisma.suggestion.findFirst.mockResolvedValue({ id: 's1', status: 'approved' });

      await expect(service.dismiss('u1', 's1')).rejects.toMatchObject({ status: 409 });
    });

    it('returns 404 when the suggestion does not exist for this user', async () => {
      prisma.suggestion.updateMany.mockResolvedValue({ count: 0 });
      prisma.suggestion.findFirst.mockResolvedValue(null);

      await expect(service.dismiss('u1', 'missing')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('edit', () => {
    const paramsSchema = z.object({ billId: z.string() });

    it('validates params against the handler schema and stores originalParams on first edit', async () => {
      prisma.suggestion.findFirst.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'pending',
        actionType: 'sandbox.apply-ok',
        params: { billId: 'old' },
        originalParams: null,
        connectionId: 'bill-to-reminder',
        targetDomain: 'tasks',
        signal: null,
      });
      registry.getHandler.mockReturnValue({ paramsSchema });
      prisma.suggestion.update.mockResolvedValue({});

      await service.edit('u1', 's1', { billId: 'new' });

      expect(prisma.suggestion.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { params: { billId: 'new' }, originalParams: { billId: 'old' } },
      });
    });

    it('rejects params that fail the handler schema with 422', async () => {
      prisma.suggestion.findFirst.mockResolvedValue({
        id: 's1',
        userId: 'u1',
        status: 'pending',
        actionType: 'sandbox.apply-ok',
        params: {},
        connectionId: 'x',
        targetDomain: 'tasks',
      });
      registry.getHandler.mockReturnValue({ paramsSchema });

      await expect(service.edit('u1', 's1', { billId: 123 })).rejects.toMatchObject({ status: 422 });
    });

    it('rejects editing a non-pending suggestion with 409', async () => {
      prisma.suggestion.findFirst.mockResolvedValue({ id: 's1', status: 'approved' });

      await expect(service.edit('u1', 's1', { billId: 'x' })).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('enforcePendingCap', () => {
    it('expires the oldest pending suggestions once at the cap', async () => {
      configService.get.mockReturnValue(2);
      prisma.suggestion.count.mockResolvedValue(2);
      prisma.suggestion.findMany.mockResolvedValue([{ id: 'oldest' }]);
      prisma.suggestion.updateMany.mockResolvedValue({ count: 1 });

      await service.enforcePendingCap(prisma as never, 'u1', 'bill-to-reminder');

      expect(prisma.suggestion.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['oldest'] }, status: 'pending' },
        data: expect.objectContaining({ status: 'expired' }),
      });
    });

    it('does nothing when under the cap', async () => {
      configService.get.mockReturnValue(20);
      prisma.suggestion.count.mockResolvedValue(1);

      await service.enforcePendingCap(prisma as never, 'u1', 'bill-to-reminder');

      expect(prisma.suggestion.findMany).not.toHaveBeenCalled();
    });
  });
});
