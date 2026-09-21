import { Injectable, Logger } from '@nestjs/common';
import { AfterCreate, DatabaseHook } from '@thallesp/nestjs-better-auth';
import { PrismaService } from '../../lib/prisma.js';

/**
 * Creates the default UserSettings/PrivacySettings rows as soon as a user signs
 * up, so every other endpoint can assume they exist. SettingsService/PrivacyService
 * still upsert defensively in case a row is ever missing for another reason.
 */
@DatabaseHook()
@Injectable()
export class UserLifecycleHook {
  private readonly logger = new Logger(UserLifecycleHook.name);

  constructor(private readonly prisma: PrismaService) {}

  @AfterCreate('user')
  async onUserCreated(user: { id: string }): Promise<void> {
    await Promise.all([
      this.prisma.userSettings.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} }),
      this.prisma.privacySettings.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} }),
    ]);
    this.logger.log(`Initialized settings/privacy defaults for user ${user.id}`);
  }
}
