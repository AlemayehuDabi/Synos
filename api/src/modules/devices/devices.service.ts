import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.js';
import type { RegisterDeviceDto } from './dto/register-device.dto.js';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  /** A push token belongs to one user; re-registering an existing token moves it. */
  async upsertByToken(userId: string, dto: RegisterDeviceDto) {
    return this.prisma.device.upsert({
      where: { pushToken: dto.pushToken },
      create: {
        userId,
        platform: dto.platform,
        pushToken: dto.pushToken,
        appVersion: dto.appVersion,
        lastSeenAt: new Date(),
      },
      update: {
        userId,
        platform: dto.platform,
        appVersion: dto.appVersion,
        lastSeenAt: new Date(),
      },
    });
  }

  async removeOwned(userId: string, deviceId: string): Promise<void> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device || device.userId !== userId) {
      throw new NotFoundException('Device not found');
    }
    await this.prisma.device.delete({ where: { id: deviceId } });
  }

  /** Idempotent: sign-out cleanup should never fail just because the device is already gone. */
  async removeByTokenOwned(userId: string, token: string): Promise<void> {
    const device = await this.prisma.device.findUnique({ where: { pushToken: token } });
    if (!device || device.userId !== userId) {
      return;
    }
    await this.prisma.device.delete({ where: { id: device.id } });
  }
}
