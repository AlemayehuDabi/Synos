import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDeletionService } from '../../src/modules/me/account-deletion.service.js';

function createPrismaMock() {
  return {
    account: { findFirst: vi.fn() },
    user: { delete: vi.fn() },
  };
}

describe('AccountDeletionService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let authService: { api: { verifyPassword: ReturnType<typeof vi.fn> } };
  let dataExportService: { deleteAllFilesForUser: ReturnType<typeof vi.fn> };
  let service: AccountDeletionService;

  beforeEach(() => {
    prisma = createPrismaMock();
    authService = { api: { verifyPassword: vi.fn() } };
    dataExportService = { deleteAllFilesForUser: vi.fn().mockResolvedValue(undefined) };
    service = new AccountDeletionService(prisma as never, authService as never, dataExportService as never);
  });

  it('requires a password when the account has a credential login', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'acc1', providerId: 'credential' });

    await expect(
      service.deleteAccount({ userId: 'u1', sessionCreatedAt: new Date(), headers: {} }),
    ).rejects.toMatchObject({ status: 400 });

    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('rejects an incorrect password', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'acc1', providerId: 'credential' });
    authService.api.verifyPassword.mockRejectedValue(new Error('invalid password'));

    await expect(
      service.deleteAccount({ userId: 'u1', password: 'wrong', sessionCreatedAt: new Date(), headers: {} }),
    ).rejects.toMatchObject({ status: 403 });

    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('deletes export files then the user once the password checks out', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'acc1', providerId: 'credential' });
    authService.api.verifyPassword.mockResolvedValue({ status: true });

    await service.deleteAccount({ userId: 'u1', password: 'correct', sessionCreatedAt: new Date(), headers: {} });

    expect(dataExportService.deleteAllFilesForUser).toHaveBeenCalledWith('u1');
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
  });

  it('allows a social-only account to delete without a password when the session is fresh', async () => {
    prisma.account.findFirst.mockResolvedValue(null); // no credential account

    await service.deleteAccount({ userId: 'u1', sessionCreatedAt: new Date(), headers: {} });

    expect(authService.api.verifyPassword).not.toHaveBeenCalled();
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
  });

  it('rejects a social-only account whose session is older than 5 minutes', async () => {
    prisma.account.findFirst.mockResolvedValue(null);
    const staleSession = new Date(Date.now() - 10 * 60 * 1000);

    await expect(
      service.deleteAccount({ userId: 'u1', sessionCreatedAt: staleSession, headers: {} }),
    ).rejects.toMatchObject({ status: 403 });

    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});
