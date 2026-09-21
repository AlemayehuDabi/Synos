import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type Observable, of } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Request, Response } from 'express';
import { PrismaService } from '../../lib/prisma.js';

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Makes a POST safe to retry: the first successful response for an
 * (user, Idempotency-Key) pair is stored, and a replay of the same key returns
 * it instead of acting again. Requests without the header are untouched.
 *
 * Known limit: two *concurrent* first requests with the same key both run (the
 * key is only claimed once a request has succeeded). The routes it is applied to
 * are themselves guarded against double-application (compare-and-set, unique
 * constraints), so the worst case is one of them answering 409.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const response = context.switchToHttp().getResponse<Response>();

    const key = request.headers[IDEMPOTENCY_KEY_HEADER];
    const userId = request.user?.id;

    if (!key || typeof key !== 'string' || !userId) {
      return next.handle();
    }

    const path = request.originalUrl ?? request.url;
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { userId_key: { userId, key } },
    });

    if (existing && existing.expiresAt > new Date()) {
      if (existing.path !== path) {
        // Replaying a key on a different resource would silently return the wrong response.
        throw new UnprocessableEntityException('This Idempotency-Key was already used for a different request');
      }
      response.status(existing.statusCode);
      return of(existing.responseBody);
    }

    return next.handle().pipe(
      // Awaited (not fire-and-forget): Prisma queries are lazy and only run once
      // awaited, and the key must be stored before the client can possibly replay it.
      mergeMap(async (body: unknown) => {
        const record = {
          path,
          statusCode: response.statusCode,
          responseBody: JSON.parse(JSON.stringify(body ?? {})) as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + TTL_MS),
        };
        try {
          await this.prisma.idempotencyKey.upsert({
            where: { userId_key: { userId, key } },
            create: { userId, key, ...record },
            update: record,
          });
        } catch (error) {
          // The action already happened; failing the response now would invite a retry that repeats it.
          this.logger.warn(`Could not store idempotency key for ${path}: ${error instanceof Error ? error.message : String(error)}`);
        }
        return body;
      }),
    );
  }
}
