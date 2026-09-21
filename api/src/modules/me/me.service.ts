import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.js';
import type { UpdateMeDto } from './dto/update-me.dto.js';

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.toProfile(user);
  }

  async updateProfile(userId: string, dto: UpdateMeDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.image !== undefined ? { image: dto.image } : {}),
      },
    });
    return this.toProfile(user);
  }

  private toProfile(user: { id: string; email: string; emailVerified: boolean; name: string; image: string | null; createdAt: Date }) {
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      name: user.name,
      image: user.image,
      createdAt: user.createdAt,
    };
  }
}
