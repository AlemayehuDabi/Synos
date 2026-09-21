import { Injectable } from '@nestjs/common';
import { AsExportContributor } from '../../../common/export/export-contributor.decorator.js';
import type { ExportContributor } from '../../../common/export/export-contributor.interface.js';
import { PrismaService } from '../../../lib/prisma.js';

@Injectable()
@AsExportContributor()
export class ProfileExportContributor implements ExportContributor {
  readonly name = 'profile';

  constructor(private readonly prisma: PrismaService) {}

  async collect(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
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
