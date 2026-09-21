import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.js';
import type { UpdatePrivacyDto } from './dto/update-privacy.dto.js';

@Injectable()
export class PrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  /** See SettingsService.get for why this upserts defensively. */
  async get(userId: string) {
    return this.prisma.privacySettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async update(userId: string, dto: UpdatePrivacyDto) {
    const data = {
      calendar: dto.calendar,
      tasks: dto.tasks,
      habits: dto.habits,
      fitness: dto.fitness,
      finances: dto.finances,
      meals: dto.meals,
    };
    return this.prisma.privacySettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }
}
