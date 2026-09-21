import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  details?: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body: ErrorBody = {
        statusCode: status,
        error: HttpStatus[status] ?? 'Error',
        ...this.normalize(exception.getResponse(), exception.message),
      };
      response.status(status).json(body);
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    } satisfies ErrorBody);
  }

  private normalize(body: unknown, fallbackMessage: string): { message: string | string[]; details?: unknown } {
    if (typeof body === 'string') return { message: body };
    if (body && typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      if (Array.isArray(obj.message)) {
        return { message: (obj.message[0] as string) ?? fallbackMessage, details: obj.message };
      }
      if (typeof obj.message === 'string') return { message: obj.message };
    }
    return { message: fallbackMessage };
  }
}
