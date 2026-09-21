import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../lib/prisma.js';
import type { NotificationCategory } from '../generated/prisma/enums.js';
import { NOTIFICATION_CATEGORIES } from './categories.js';
import type { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto.js';
import { type ResolvedPreferences, resolvePreferences } from './preference-resolution.js';
import { parseTimeOfDay, type QuietHours } from './quiet-hours.js';

export interface DeliveryContext {
  preferences: ResolvedPreferences;
  quietHours: QuietHours | null;
  timezone: string;
}

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Everything the delivery path needs about one user, in a single round of queries. */
  async loadForDelivery(userId: string): Promise<DeliveryContext> {
    const [stored, settings, userSettings] = await Promise.all([
      this.prisma.notificationPreference.findMany({ where: { userId } }),
      this.prisma.notificationSettings.findUnique({ where: { userId } }),
      this.prisma.userSettings.findUnique({ where: { userId }, select: { timezone: true } }),
    ]);
    return {
      preferences: resolvePreferences(stored),
      quietHours:
        settings?.quietHoursStart && settings.quietHoursEnd
          ? { start: settings.quietHoursStart, end: settings.quietHoursEnd }
          : null,
      timezone: userSettings?.timezone ?? 'UTC',
    };
  }

  async get(userId: string) {
    const { preferences, quietHours, timezone } = await this.loadForDelivery(userId);
    return {
      categories: NOTIFICATION_CATEGORIES.map((category) => ({ category, ...preferences[category] })),
      quietHours: { start: quietHours?.start ?? null, end: quietHours?.end ?? null, timezone },
    };
  }

  async update(userId: string, dto: UpdateNotificationPreferencesDto) {
    const seen = new Set<NotificationCategory>();
    for (const entry of dto.categories ?? []) {
      if (seen.has(entry.category)) {
        throw new BadRequestException(`Category "${entry.category}" appears more than once`);
      }
      seen.add(entry.category);
    }

    const quiet = dto.quietHours === undefined ? undefined : this.validateQuietHours(dto.quietHours);

    await this.prisma.$transaction(async (tx) => {
      for (const entry of dto.categories ?? []) {
        const change = { inApp: entry.inApp, push: entry.push };
        await tx.notificationPreference.upsert({
          where: { userId_category: { userId, category: entry.category } },
          create: { userId, category: entry.category, ...change },
          update: change,
        });
      }
      if (quiet !== undefined) {
        const values = { quietHoursStart: quiet?.start ?? null, quietHoursEnd: quiet?.end ?? null };
        await tx.notificationSettings.upsert({
          where: { userId },
          create: { userId, ...values },
          update: values,
        });
      }
    });

    return this.get(userId);
  }

  /** Both times or neither; `null` clears. A zero-length range is refused rather than guessed at. */
  private validateQuietHours(input: { start?: string | null; end?: string | null } | null): QuietHours | null {
    if (input === null) return null;
    const { start = null, end = null } = input;
    if (start === null && end === null) return null;
    if (start === null || end === null) {
      throw new BadRequestException('Quiet hours need both a start and an end (or both null to turn them off)');
    }
    if (parseTimeOfDay(start) === parseTimeOfDay(end)) {
      throw new BadRequestException('Quiet hours start and end must differ');
    }
    return { start, end };
  }
}
