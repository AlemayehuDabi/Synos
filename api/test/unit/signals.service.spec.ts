import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignalsService } from '../../src/signal-engine/services/signals.service.js';
import { Prisma } from '../../src/generated/prisma/client.js';

function createPrismaMock() {
  return {
    signal: {
      create: vi.fn(),
      findFirstOrThrow: vi.fn(),
      findMany: vi.fn(),
    },
  };
}

describe('SignalsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: SignalsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new SignalsService(prisma as never);
  });

  it('rejects an unknown signal type', async () => {
    await expect(service.persist({ userId: 'u1', type: 'not.a.type', payload: {} })).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.signal.create).not.toHaveBeenCalled();
  });

  it('rejects a payload that fails schema validation', async () => {
    await expect(
      service.persist({ userId: 'u1', type: 'meal.logged', payload: { mealLogId: 'x' } }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('persists a valid signal with the catalog-resolved domain and schema version', async () => {
    prisma.signal.create.mockResolvedValue({ id: 's1' });

    await service.persist({
      userId: 'u1',
      type: 'workout.completed',
      payload: { workoutId: 'w1', completedAt: '2026-09-21T00:00:00.000Z', durationMinutes: 30, workoutType: 'run' },
    });

    expect(prisma.signal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'workout.completed', sourceDomain: 'fitness', schemaVersion: 1 }),
      }),
    );
  });

  it('returns the existing row instead of throwing on a dedupeKey collision', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '7.10.0' });
    prisma.signal.create.mockRejectedValue(conflict);
    prisma.signal.findFirstOrThrow.mockResolvedValue({ id: 'existing' });

    const result = await service.persist({
      userId: 'u1',
      type: 'bill.due',
      dedupeKey: 'k1',
      payload: { billId: 'b1', dueDate: '2026-09-21', amountCents: 100, currency: 'USD', daysUntilDue: 3 },
    });

    expect(result).toEqual({ id: 'existing' });
    expect(prisma.signal.findFirstOrThrow).toHaveBeenCalledWith({ where: { userId: 'u1', dedupeKey: 'k1' } });
  });
});
