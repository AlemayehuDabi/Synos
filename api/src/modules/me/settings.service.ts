import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.js';
import type { UpdateSettingsDto } from './dto/update-settings.dto.js';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * UserSettings rows are created eagerly by UserLifecycleHook on sign-up, but we
   * upsert defensively here too so a missing row (e.g. a user created before this
   * hook existed) never surfaces as a 404.
   */
  async get(userId: string) {
    return this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async update(userId: string, dto: UpdateSettingsDto) {
    const data = {
      timezone: dto.timezone,
      weekStartsOn: dto.weekStartsOn,
      units: dto.units,
      currency: dto.currency,
      locale: dto.locale,
    };
    return this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }
}
