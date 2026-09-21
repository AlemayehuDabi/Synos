import { ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { PrismaService } from '../../lib/prisma.js';
import { EXPORT_CONTRIBUTOR_METADATA } from '../../common/export/export-contributor.decorator.js';
import type { ExportContributor } from '../../common/export/export-contributor.interface.js';
import { JobRunner } from '../../common/jobs/job-runner.js';
import { StorageService } from './storage.service.js';

const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_BETWEEN_REQUESTS_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DataExportService implements OnModuleInit {
  private readonly logger = new Logger(DataExportService.name);
  private contributors: ExportContributor[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly discoveryService: DiscoveryService,
    private readonly jobRunner: JobRunner,
    private readonly storageService: StorageService,
  ) {}

  onModuleInit(): void {
    this.contributors = this.discoveryService
      .getProviders()
      .filter((wrapper) => wrapper.metatype && Reflect.getMetadata(EXPORT_CONTRIBUTOR_METADATA, wrapper.metatype))
      .map((wrapper) => wrapper.instance as ExportContributor)
      .filter((instance): instance is ExportContributor => Boolean(instance) && typeof instance.collect === 'function');

    this.logger.log(`Registered export contributors: ${this.contributors.map((c) => c.name).join(', ') || '(none)'}`);
  }

  async createJob(userId: string) {
    const active = await this.prisma.dataExportJob.findFirst({
      where: { userId, status: { in: ['queued', 'running'] } },
    });
    if (active) {
      throw new ConflictException('An export is already in progress');
    }

    const recent = await this.prisma.dataExportJob.findFirst({
      where: { userId, requestedAt: { gte: new Date(Date.now() - MIN_INTERVAL_BETWEEN_REQUESTS_MS) } },
      orderBy: { requestedAt: 'desc' },
    });
    if (recent) {
      throw new HttpException('Only one export can be requested per 24 hours', HttpStatus.TOO_MANY_REQUESTS);
    }

    const job = await this.prisma.dataExportJob.create({
      data: { userId, status: 'queued', format: 'json' },
    });

    this.jobRunner.run(() => this.runExport(job.id));

    return job;
  }

  private async runExport(jobId: string): Promise<void> {
    const job = await this.prisma.dataExportJob.update({
      where: { id: jobId },
      data: { status: 'running' },
    });

    try {
      const data: Record<string, unknown> = {};
      for (const contributor of this.contributors) {
        data[contributor.name] = await contributor.collect(job.userId);
      }

      const storageKey = `${job.userId}/${job.id}.json`;
      await this.storageService.write(storageKey, JSON.stringify(data, null, 2));

      await this.prisma.dataExportJob.update({
        where: { id: jobId },
        data: {
          status: 'ready',
          storageKey,
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + EXPORT_TTL_MS),
        },
      });
    } catch (error) {
      await this.prisma.dataExportJob.update({
        where: { id: jobId },
        data: { status: 'failed', error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  async getJobForOwner(userId: string, jobId: string) {
    const job = await this.prisma.dataExportJob.findUnique({ where: { id: jobId } });
    if (!job || job.userId !== userId) {
      throw new NotFoundException('Export job not found');
    }
    return job;
  }

  async downloadFile(userId: string, jobId: string): Promise<{ buffer: Buffer; filename: string }> {
    const job = await this.getJobForOwner(userId, jobId);
    if (job.status !== 'ready' || !job.storageKey) {
      throw new NotFoundException('Export is not ready for download');
    }
    const buffer = await this.storageService.read(job.storageKey);
    return { buffer, filename: `synos-export-${job.id}.json` };
  }

  async deleteAllFilesForUser(userId: string): Promise<void> {
    const jobs = await this.prisma.dataExportJob.findMany({
      where: { userId, storageKey: { not: null } },
      select: { storageKey: true },
    });
    await Promise.all(
      jobs
        .filter((job): job is { storageKey: string } => Boolean(job.storageKey))
        .map((job) => this.storageService.delete(job.storageKey)),
    );
  }

  async expireStaleJobs(): Promise<number> {
    const stale = await this.prisma.dataExportJob.findMany({
      where: { status: 'ready', expiresAt: { lt: new Date() } },
    });

    for (const job of stale) {
      if (job.storageKey) {
        await this.storageService.delete(job.storageKey);
      }
      await this.prisma.dataExportJob.update({
        where: { id: job.id },
        data: { status: 'expired', storageKey: null },
      });
    }

    return stale.length;
  }
}
