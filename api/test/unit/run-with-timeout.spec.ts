import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWithTimeout } from '../../src/common/async/run-with-timeout.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('runWithTimeout', () => {
  it('returns the value of work that finishes in time', async () => {
    await expect(runWithTimeout(async () => 42, 1000)).resolves.toEqual({ status: 'ok', value: 42 });
  });

  it('reports a timeout for work that takes too long', async () => {
    const result = await runWithTimeout(() => new Promise<never>(() => undefined), 20);
    expect(result).toEqual({ status: 'timeout' });
  });

  it('reports an error for work that rejects, without rejecting itself', async () => {
    const failure = new Error('boom');
    await expect(runWithTimeout(async () => Promise.reject(failure), 1000)).resolves.toEqual({
      status: 'error',
      error: failure,
    });
  });

  it('reports an error for work that throws before returning a promise', async () => {
    const result = await runWithTimeout(() => {
      throw new Error('sync boom');
    }, 1000);
    expect(result.status).toBe('error');
  });

  it('leaves no timer behind once the work has finished', async () => {
    vi.useFakeTimers();
    await runWithTimeout(async () => 1, 5000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not let work that fails after the timeout become an unhandled rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const result = await runWithTimeout(
        () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('late')), 40)),
        10,
      );
      expect(result.status).toBe('timeout');
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
