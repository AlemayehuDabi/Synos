import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export abstract class StorageService {
  abstract write(key: string, data: string): Promise<void>;
  abstract read(key: string): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
}

/**
 * Local-disk implementation. Swap the binding in DataExportModule for an
 * S3/GCS-backed StorageService if exports ever need to live somewhere durable.
 */
@Injectable()
export class LocalDiskStorageService extends StorageService {
  private readonly baseDir: string;

  constructor(configService: ConfigService) {
    super();
    this.baseDir = path.resolve(configService.get<string>('EXPORT_STORAGE_DIR', './storage/exports'));
  }

  private resolvePath(key: string): string {
    const resolved = path.resolve(this.baseDir, key);
    if (resolved !== this.baseDir && !resolved.startsWith(`${this.baseDir}${path.sep}`)) {
      throw new Error('Invalid storage key');
    }
    return resolved;
  }

  async write(key: string, data: string): Promise<void> {
    const filePath = this.resolvePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data, 'utf8');
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.resolvePath(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolvePath(key), { force: true });
  }
}
