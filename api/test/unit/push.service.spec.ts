import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushService } from '../../src/notifications/push/push.service.js';

const payload = { title: 'Hello', body: 'World', data: { category: 'system' } };
const delivery = { category: 'system' as const, timezone: 'UTC', quietHours: null, now: new Date('2026-09-21T12:00:00Z') };
const phone = { id: 'device-1', platform: 'android' as const, pushToken: 'token-1' };
const tablet = { id: 'device-2', platform: 'ios' as const, pushToken: 'token-2' };

function build(devices = [phone], claim = true) {
  const prisma = { device: { findMany: vi.fn().mockResolvedValue(devices), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) } };
  const provider = { send: vi.fn().mockResolvedValue({ outcome: 'sent' }) };
  const throttle = { claim: vi.fn().mockResolvedValue(claim) };
  let job: Promise<void> = Promise.resolve();
  const jobRunner = { run: vi.fn((task: () => Promise<void>) => void (job = task())) };
  const config = { get: (key: string, fallback: number) => ({ PUSH_MAX_ATTEMPTS: 3, PUSH_RETRY_BASE_DELAY_MS: 0 })[key] ?? fallback };
  const service = new PushService(prisma as never, jobRunner as never, throttle as never, config as never, provider as never);
  return { service, prisma, provider, throttle, jobRunner, finished: () => job };
}

describe('PushService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('sends the message to every device of the user', async () => {
    const { service, provider, finished } = build([phone, tablet]);
    expect(await service.pushToUser('user-1', payload, delivery)).toBe(true);
    await finished();

    expect(provider.send).toHaveBeenCalledTimes(2);
    expect(provider.send).toHaveBeenCalledWith({ token: 'token-1', platform: 'android', ...payload });
    expect(provider.send).toHaveBeenCalledWith({ token: 'token-2', platform: 'ios', ...payload });
  });

  it('holds the push back during quiet hours, before touching devices or the rate limit', async () => {
    const { service, prisma, throttle, jobRunner } = build();
    const quiet = { ...delivery, quietHours: { start: '11:00', end: '13:00' } };

    expect(await service.pushToUser('user-1', payload, quiet)).toBe(false);
    expect(prisma.device.findMany).not.toHaveBeenCalled();
    expect(throttle.claim).not.toHaveBeenCalled();
    expect(jobRunner.run).not.toHaveBeenCalled();
  });

  it('reads quiet hours on the user\'s clock', async () => {
    const { service } = build();
    const quiet = { start: '22:00', end: '07:00' };
    // 12:00 UTC is 15:00 in Nairobi: outside. 19:30 UTC is 22:30 there: inside.
    expect(await service.pushToUser('u', payload, { ...delivery, timezone: 'Africa/Nairobi', quietHours: quiet })).toBe(true);
    expect(
      await service.pushToUser('u', payload, { ...delivery, timezone: 'Africa/Nairobi', quietHours: quiet, now: new Date('2026-09-21T19:30:00Z') }),
    ).toBe(false);
  });

  it('does nothing, and uses no rate-limit slot, when the user has no devices', async () => {
    const { service, throttle, jobRunner } = build([]);
    expect(await service.pushToUser('user-1', payload, { ...delivery, minIntervalSeconds: 60 })).toBe(false);
    expect(throttle.claim).not.toHaveBeenCalled();
    expect(jobRunner.run).not.toHaveBeenCalled();
  });

  it('only rate-limits when asked to, and holds the push back when the slot is taken', async () => {
    const free = build();
    await free.service.pushToUser('user-1', payload, delivery);
    expect(free.throttle.claim).not.toHaveBeenCalled();

    const limited = build([phone], false);
    expect(await limited.service.pushToUser('user-1', payload, { ...delivery, minIntervalSeconds: 60 })).toBe(false);
    expect(limited.throttle.claim).toHaveBeenCalledWith('user-1', 'system', 60, delivery.now);
    expect(limited.jobRunner.run).not.toHaveBeenCalled();
  });

  it('removes a device whose token the provider reports as permanently invalid', async () => {
    const { service, provider, prisma, finished } = build();
    provider.send.mockResolvedValue({ outcome: 'invalid_token' });
    await service.pushToUser('user-1', payload, delivery);
    await finished();

    expect(prisma.device.deleteMany).toHaveBeenCalledWith({ where: { id: 'device-1', pushToken: 'token-1' } });
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure and stops as soon as it works', async () => {
    const { service, provider, prisma, finished } = build();
    provider.send.mockRejectedValueOnce(new Error('503')).mockRejectedValueOnce(new Error('503')).mockResolvedValue({ outcome: 'sent' });
    await service.pushToUser('user-1', payload, delivery);
    await finished();

    expect(provider.send).toHaveBeenCalledTimes(3);
    expect(prisma.device.deleteMany).not.toHaveBeenCalled();
  });

  it('gives up after the configured attempts, keeps the device and never throws', async () => {
    const { service, provider, prisma, finished } = build();
    provider.send.mockRejectedValue(new Error('503'));
    await service.pushToUser('user-1', payload, delivery);
    await expect(finished()).resolves.toBeUndefined();

    expect(provider.send).toHaveBeenCalledTimes(3);
    expect(prisma.device.deleteMany).not.toHaveBeenCalled();
  });

  it('backs off exponentially between attempts', async () => {
    vi.useFakeTimers();
    try {
      const { provider, prisma, throttle } = build();
      const config = { get: (key: string, fallback: number) => ({ PUSH_MAX_ATTEMPTS: 3, PUSH_RETRY_BASE_DELAY_MS: 100 })[key] ?? fallback };
      const service = new PushService(
        prisma as never,
        { run: (task: () => Promise<void>) => void task() } as never,
        throttle as never,
        config as never,
        provider as never,
      );
      provider.send.mockRejectedValue(new Error('503'));
      await service.pushToUser('user-1', payload, delivery);

      await vi.advanceTimersByTimeAsync(0);
      expect(provider.send).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(99);
      expect(provider.send).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1); // first retry after 100ms
      expect(provider.send).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(199);
      expect(provider.send).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1); // second retry 200ms after that
      expect(provider.send).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('one device failing does not stop the others', async () => {
    const { service, provider, finished } = build([phone, tablet]);
    provider.send.mockImplementation(async ({ token }: { token: string }) => {
      if (token === 'token-1') throw new Error('503');
      return { outcome: 'sent' };
    });
    await service.pushToUser('user-1', payload, delivery);
    await finished();

    expect(provider.send.mock.calls.filter(([message]) => message.token === 'token-2')).toHaveLength(1);
  });
});
