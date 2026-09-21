import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataExportService } from '../../src/modules/data-export/data-export.service.js';
import { EXPORT_CONTRIBUTOR_METADATA } from '../../src/common/export/export-contributor.decorator.js';

class FakeContributor {
  name = 'fake';
  collect = vi.fn().mockResolvedValue({ hello: 'world' });
}
Reflect.defineMetadata(EXPORT_CONTRIBUTOR_METADATA, true, FakeContributor);

function createPrismaMock() {
  return {
    dataExportJob: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  };
}

function createDiscoveryMock(instances: unknown[]) {
  return {
    getProviders: vi.fn().mockReturnValue(instances.map((instance) => ({ metatype: (instance as object).constructor, instance }))),
  };
}

describe('DataExportService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let jobRunner: { run: ReturnType<typeof vi.fn> };
  let storage: { write: ReturnType<typeof vi.fn>; read: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  let contributor: FakeContributor;
  let service: DataExportService;

  beforeEach(() => {
    prisma = createPrismaMock();
    jobRunner = { run: vi.fn() };
    storage = {
      write: vi.fn().mockResolvedValue(undefined),
      read: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    contributor = new FakeContributor();
    const discovery = createDiscoveryMock([contributor]);

    service = new DataExportService(prisma as never, discovery as never, jobRunner as never, storage as never);
    service.onModuleInit();
  });

  describe('createJob', () => {
    it('rejects with 409 when a job is already queued or running', async () => {
      prisma.dataExportJob.findFirst.mockResolvedValueOnce({ id: 'existing', status: 'queued' });

      await expect(service.createJob('u1')).rejects.toMatchObject({ status: 409 });
      expect(jobRunner.run).not.toHaveBeenCalled();
    });

    it('rejects with 429 when a job was already requested in the last 24h', async () => {
      prisma.dataExportJob.findFirst
        .mockResolvedValueOnce(null) // no active job
        .mockResolvedValueOnce({ id: 'recent' }); // requested recently

      await expect(service.createJob('u1')).rejects.toMatchObject({ status: 429 });
      expect(jobRunner.run).not.toHaveBeenCalled();
    });

    it('creates a job and hands it to the job runner', async () => {
      prisma.dataExportJob.findFirst.mockResolvedValue(null);
      prisma.dataExportJob.create.mockResolvedValue({ id: 'job1', userId: 'u1', status: 'queued' });

      const job = await service.createJob('u1');

      expect(job).toEqual({ id: 'job1', userId: 'u1', status: 'queued' });
      expect(jobRunner.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('the task handed to JobRunner', () => {
    it('collects data from every registered contributor and marks the job ready', async () => {
      prisma.dataExportJob.findFirst.mockResolvedValue(null);
      prisma.dataExportJob.create.mockResolvedValue({ id: 'job1', userId: 'u1', status: 'queued' });
      prisma.dataExportJob.update.mockResolvedValue({ id: 'job1', userId: 'u1', status: 'running' });

      await service.createJob('u1');
      const task = jobRunner.run.mock.calls[0][0] as () => Promise<void>;
      await task();

      expect(contributor.collect).toHaveBeenCalledWith('u1');
      expect(storage.write).toHaveBeenCalledWith('u1/job1.json', JSON.stringify({ fake: { hello: 'world' } }, null, 2));
      expect(prisma.dataExportJob.update).toHaveBeenLastCalledWith({
        where: { id: 'job1' },
        data: expect.objectContaining({ status: 'ready', storageKey: 'u1/job1.json' }),
      });
    });

    it('marks the job failed if a contributor throws', async () => {
      prisma.dataExportJob.findFirst.mockResolvedValue(null);
      prisma.dataExportJob.create.mockResolvedValue({ id: 'job1', userId: 'u1', status: 'queued' });
      prisma.dataExportJob.update.mockResolvedValue({ id: 'job1', userId: 'u1', status: 'running' });
      contributor.collect.mockRejectedValueOnce(new Error('boom'));

      await service.createJob('u1');
      const task = jobRunner.run.mock.calls[0][0] as () => Promise<void>;
      await task();

      expect(prisma.dataExportJob.update).toHaveBeenLastCalledWith({
        where: { id: 'job1' },
        data: { status: 'failed', error: 'boom' },
      });
      expect(storage.write).not.toHaveBeenCalled();
    });
  });

  describe('expireStaleJobs', () => {
    it('deletes files and marks stale ready jobs as expired', async () => {
      prisma.dataExportJob.findMany.mockResolvedValue([
        { id: 'job1', storageKey: 'u1/job1.json' },
        { id: 'job2', storageKey: null },
      ]);
      prisma.dataExportJob.update.mockResolvedValue({});

      const count = await service.expireStaleJobs();

      expect(count).toBe(2);
      expect(storage.delete).toHaveBeenCalledWith('u1/job1.json');
      expect(storage.delete).toHaveBeenCalledTimes(1);
      expect(prisma.dataExportJob.update).toHaveBeenCalledWith({
        where: { id: 'job1' },
        data: { status: 'expired', storageKey: null },
      });
    });
  });
});
