import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'node:http';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { PrismaService } from '../../lib/prisma.js';
import type { Auth } from '../../lib/auth.js';
import { DataExportService } from '../data-export/data-export.service.js';

const FRESH_SESSION_WINDOW_MS = 5 * 60 * 1000;

@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService<Auth>,
    private readonly dataExportService: DataExportService,
  ) {}

  async deleteAccount(params: {
    userId: string;
    password?: string;
    sessionCreatedAt: Date;
    headers: IncomingHttpHeaders;
  }): Promise<void> {
    const { userId, password, sessionCreatedAt, headers } = params;

    const credentialAccount = await this.prisma.account.findFirst({
      where: { userId, providerId: 'credential' },
    });

    if (credentialAccount) {
      if (!password) {
        throw new BadRequestException('password is required to delete this account');
      }
      try {
        await this.authService.api.verifyPassword({
          body: { password },
          headers: fromNodeHeaders(headers),
        });
      } catch {
        throw new ForbiddenException('incorrect password');
      }
    } else {
      const isFresh = Date.now() - sessionCreatedAt.getTime() <= FRESH_SESSION_WINDOW_MS;
      if (!isFresh) {
        throw new ForbiddenException('please sign in again before deleting your account');
      }
    }

    // Cascade deletes handle every DB row hanging off the user (sessions, accounts,
    // settings, privacy, devices, export jobs, idempotency keys). Files on disk are
    // not part of the DB and must be removed first, before their job rows disappear.
    await this.dataExportService.deleteAllFilesForUser(userId);
    await this.prisma.user.delete({ where: { id: userId } });
  }
}
