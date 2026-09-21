import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionsService } from '../../src/signal-engine/services/connections.service.js';

function createPrismaMock() {
  return {
    connectionSetting: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };
}

describe('ConnectionsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let activityService: { log: ReturnType<typeof vi.fn> };
  let registry: { isConnectionAvailable: ReturnType<typeof vi.fn> };
  let service: ConnectionsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    activityService = { log: vi.fn().mockResolvedValue(undefined) };
    registry = { isConnectionAvailable: vi.fn().mockReturnValue(true) };
    service = new ConnectionsService(prisma as never, activityService as never, registry as never);
  });

  it('rejects a mode above the connection maxMode', async () => {
    await expect(service.setMode('u1', 'budget-overrun-to-cheaper-meals', 'auto')).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.connectionSetting.upsert).not.toHaveBeenCalled();
  });

  it('rejects an unknown connection id', async () => {
    await expect(service.setMode('u1', 'not-a-connection', 'suggest')).rejects.toMatchObject({ status: 404 });
  });

  it('allows a mode at or below maxMode and logs mode_changed', async () => {
    prisma.connectionSetting.upsert.mockResolvedValue({ mode: 'auto', updatedAt: new Date() });

    const result = await service.setMode('u1', 'bill-to-reminder', 'auto');

    expect(result.mode).toBe('auto');
    expect(activityService.log).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'mode_changed', connectionId: 'bill-to-reminder' }),
    );
  });

  it('merges catalog defaults with stored settings and availability in listForUser', async () => {
    prisma.connectionSetting.findMany.mockResolvedValue([
      { connectionId: 'bill-to-reminder', mode: 'auto', updatedAt: new Date('2026-01-01') },
    ]);
    registry.isConnectionAvailable.mockImplementation((id: string) => id === 'bill-to-reminder');

    const result = await service.listForUser('u1');
    const bill = result.find((c) => c.id === 'bill-to-reminder')!;
    const grocery = result.find((c) => c.id === 'grocery-cost-to-budget')!;

    expect(bill.mode).toBe('auto');
    expect(bill.available).toBe(true);
    expect(grocery.mode).toBe(grocery.defaultMode);
    expect(grocery.available).toBe(false);
  });
});
