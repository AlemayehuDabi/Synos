import { firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdempotencyInterceptor } from '../../src/common/idempotency/idempotency.interceptor.js';

function makeContext(headers: Record<string, string>, user: { id: string } | undefined, statusCode = 200) {
  const response = { statusCode, status: vi.fn((code: number) => Object.assign(response, { statusCode: code })) };
  const request = { headers, user, originalUrl: '/api/v1/inbox/abc/approve' };
  return {
    context: { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) },
    response,
  };
}

describe('IdempotencyInterceptor', () => {
  let prisma: {
    idempotencyKey: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
  };
  let interceptor: IdempotencyInterceptor;
  let handler: { handle: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = { idempotencyKey: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}) } };
    interceptor = new IdempotencyInterceptor(prisma as never);
    handler = { handle: vi.fn(() => of({ id: 'result', when: new Date('2026-01-01T00:00:00.000Z') })) };
  });

  it('does nothing without an Idempotency-Key header', async () => {
    const { context } = makeContext({}, { id: 'u1' });

    const result = await firstValueFrom(await interceptor.intercept(context as never, handler as never));

    expect(result).toMatchObject({ id: 'result' });
    expect(prisma.idempotencyKey.findUnique).not.toHaveBeenCalled();
    expect(prisma.idempotencyKey.upsert).not.toHaveBeenCalled();
  });

  it('does nothing for an unauthenticated request', async () => {
    const { context } = makeContext({ 'idempotency-key': 'k1' }, undefined);

    await firstValueFrom(await interceptor.intercept(context as never, handler as never));

    expect(prisma.idempotencyKey.upsert).not.toHaveBeenCalled();
  });

  it('stores the first successful response before emitting it (the write is awaited, not dropped)', async () => {
    let written = false;
    prisma.idempotencyKey.upsert.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      written = true;
    });
    const { context } = makeContext({ 'idempotency-key': 'k1' }, { id: 'u1' }, 201);

    const result = await firstValueFrom(await interceptor.intercept(context as never, handler as never));

    expect(written).toBe(true);
    expect(result).toMatchObject({ id: 'result' });
    expect(prisma.idempotencyKey.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_key: { userId: 'u1', key: 'k1' } },
        create: expect.objectContaining({
          userId: 'u1',
          key: 'k1',
          path: '/api/v1/inbox/abc/approve',
          statusCode: 201,
          responseBody: { id: 'result', when: '2026-01-01T00:00:00.000Z' },
        }),
      }),
    );
  });

  it('replays the stored response without running the handler again', async () => {
    prisma.idempotencyKey.findUnique.mockResolvedValue({
      path: '/api/v1/inbox/abc/approve',
      statusCode: 200,
      responseBody: { id: 'first' },
      expiresAt: new Date(Date.now() + 60_000),
    });
    const { context, response } = makeContext({ 'idempotency-key': 'k1' }, { id: 'u1' });

    const result = await firstValueFrom(await interceptor.intercept(context as never, handler as never));

    expect(result).toEqual({ id: 'first' });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('runs the handler and overwrites the key once the stored one has expired', async () => {
    prisma.idempotencyKey.findUnique.mockResolvedValue({
      path: '/api/v1/inbox/abc/approve',
      statusCode: 200,
      responseBody: { id: 'stale' },
      expiresAt: new Date(Date.now() - 1000),
    });
    const { context } = makeContext({ 'idempotency-key': 'k1' }, { id: 'u1' });

    const result = await firstValueFrom(await interceptor.intercept(context as never, handler as never));

    expect(result).toMatchObject({ id: 'result' });
    expect(prisma.idempotencyKey.upsert).toHaveBeenCalledTimes(1);
  });

  it('refuses (422) to replay a key that was first used on a different path', async () => {
    prisma.idempotencyKey.findUnique.mockResolvedValue({
      path: '/api/v1/inbox/OTHER/approve',
      statusCode: 200,
      responseBody: { id: 'other' },
      expiresAt: new Date(Date.now() + 60_000),
    });
    const { context } = makeContext({ 'idempotency-key': 'k1' }, { id: 'u1' });

    await expect(interceptor.intercept(context as never, handler as never)).rejects.toMatchObject({ status: 422 });
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('still returns the response when storing the key fails, since the action already happened', async () => {
    prisma.idempotencyKey.upsert.mockRejectedValue(new Error('db is down'));
    const { context } = makeContext({ 'idempotency-key': 'k1' }, { id: 'u1' });

    const result = await firstValueFrom(await interceptor.intercept(context as never, handler as never));

    expect(result).toMatchObject({ id: 'result' });
  });
});
