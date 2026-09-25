import { Injectable } from '@nestjs/common';
import { PrismaService } from '../lib/prisma.js';

/**
 * Fitness data is private by default. Nothing here ever shows one user's fitness data to
 * another (every query is owner-scoped); what PrivacySettings.fitness controls is how much of
 * it Fitness hands to *other domains* - today, how much detail a workout shows on the calendar.
 */
@Injectable()
export class FitnessPrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  /** True only when the user has explicitly set fitness to "shared"; a missing row counts as private. */
  async isShared(userId: string): Promise<boolean> {
    const settings = await this.prisma.privacySettings.findUnique({ where: { userId }, select: { fitness: true } });
    return settings?.fitness === 'shared';
  }
}
