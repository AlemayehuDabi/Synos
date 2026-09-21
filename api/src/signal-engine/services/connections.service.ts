import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.js';
import { ConnectionMode } from '../../generated/prisma/enums.js';
import { allConnectionIds, getConnectionCatalogEntry, isKnownConnectionId } from '../catalog/connections.js';
import { SignalRegistryService } from '../registry/registry.service.js';
import type { PrismaTransactionClient } from '../registry/types.js';
import { ActivityService } from './activity.service.js';

const MODE_RANK: Record<ConnectionMode, number> = { off: 0, suggest: 1, auto: 2 };

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
    private readonly registry: SignalRegistryService,
  ) {}

  async listForUser(userId: string) {
    const settings = await this.prisma.connectionSetting.findMany({ where: { userId } });
    const settingByConnection = new Map(settings.map((s) => [s.connectionId, s]));

    return allConnectionIds().map((id) => {
      const catalogEntry = getConnectionCatalogEntry(id);
      const setting = settingByConnection.get(id);
      return {
        id: catalogEntry.id,
        name: catalogEntry.name,
        description: catalogEntry.description,
        sourceDomain: catalogEntry.sourceDomain,
        sourceSignals: catalogEntry.sourceSignals,
        targetDomain: catalogEntry.targetDomain,
        defaultMode: catalogEntry.defaultMode,
        maxMode: catalogEntry.maxMode,
        mode: setting?.mode ?? catalogEntry.defaultMode,
        available: this.registry.isConnectionAvailable(id),
        updatedAt: setting?.updatedAt ?? null,
      };
    });
  }

  /** Effective mode = the user's stored override, or the catalog default. */
  async getEffectiveMode(
    userId: string,
    connectionId: string,
    tx?: PrismaTransactionClient,
  ): Promise<ConnectionMode> {
    const client = tx ?? this.prisma;
    const setting = await client.connectionSetting.findUnique({
      where: { userId_connectionId: { userId, connectionId } },
    });
    if (setting) return setting.mode;
    if (!isKnownConnectionId(connectionId)) {
      throw new NotFoundException(`Unknown connection "${connectionId}"`);
    }
    return getConnectionCatalogEntry(connectionId).defaultMode;
  }

  async setMode(userId: string, connectionId: string, mode: ConnectionMode) {
    if (!isKnownConnectionId(connectionId)) {
      throw new NotFoundException(`Unknown connection "${connectionId}"`);
    }
    const catalogEntry = getConnectionCatalogEntry(connectionId);
    if (MODE_RANK[mode] > MODE_RANK[catalogEntry.maxMode]) {
      throw new BadRequestException(`Connection "${connectionId}" cannot be set above "${catalogEntry.maxMode}"`);
    }

    const setting = await this.prisma.connectionSetting.upsert({
      where: { userId_connectionId: { userId, connectionId } },
      create: { userId, connectionId, mode },
      update: { mode },
    });

    // Pending suggestions from a connection switched to off are left untouched by design.
    await this.activityService.log({
      userId,
      kind: 'mode_changed',
      connectionId,
      targetDomain: catalogEntry.targetDomain,
      after: { mode },
    });

    return {
      id: catalogEntry.id,
      name: catalogEntry.name,
      description: catalogEntry.description,
      sourceDomain: catalogEntry.sourceDomain,
      sourceSignals: catalogEntry.sourceSignals,
      targetDomain: catalogEntry.targetDomain,
      defaultMode: catalogEntry.defaultMode,
      maxMode: catalogEntry.maxMode,
      mode: setting.mode,
      available: this.registry.isConnectionAvailable(connectionId),
      updatedAt: setting.updatedAt,
    };
  }
}
