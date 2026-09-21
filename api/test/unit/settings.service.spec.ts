import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/modules/me/settings.service.js';

function createPrismaMock() {
  return {
    userSettings: {
      upsert: vi.fn(),
    },
  };
}

describe('SettingsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: SettingsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new SettingsService(prisma as never);
  });

  it('upserts defensively on get, in case the sign-up hook never ran', async () => {
    prisma.userSettings.upsert.mockResolvedValue({ userId: 'u1', timezone: 'UTC' });

    const result = await service.get('u1');

    expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      create: { userId: 'u1' },
      update: {},
    });
    expect(result).toEqual({ userId: 'u1', timezone: 'UTC' });
  });

  it('applies a partial update via upsert', async () => {
    prisma.userSettings.upsert.mockResolvedValue({ userId: 'u1', timezone: 'Europe/Paris' });

    await service.update('u1', { timezone: 'Europe/Paris' });

    expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      create: { userId: 'u1', timezone: 'Europe/Paris' },
      update: { timezone: 'Europe/Paris' },
    });
  });
});
