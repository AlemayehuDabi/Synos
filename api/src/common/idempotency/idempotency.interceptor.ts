import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { type Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { PrismaService } from '../../lib/prisma.js';

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const response = context.switchToHttp().getResponse<Response>();

    const key = request.headers[IDEMPOTENCY_KEY_HEADER];
    const userId = request.user?.id;

    if (!key || typeof key !== 'string' || !userId) {
      return next.handle();
    }

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { userId_key: { userId, key } },
    });

    if (existing && existing.expiresAt > new Date()) {
      response.status(existing.statusCode);
      return of(existing.responseBody);
    }

    return next.handle().pipe(
      tap((body: unknown) => {
        void this.prisma.idempotencyKey.upsert({
          where: { userId_key: { userId, key } },
          create: {
            userId,
            key,
            path: request.originalUrl ?? request.url,
            statusCode: response.statusCode,
            responseBody: (body ?? {}) as object,
            expiresAt: new Date(Date.now() + TTL_MS),
          },
          update: {
            path: request.originalUrl ?? request.url,
            statusCode: response.statusCode,
            responseBody: (body ?? {}) as object,
            expiresAt: new Date(Date.now() + TTL_MS),
          },
        });
      }),
    );
  }
}
