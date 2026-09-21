import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { DataExportController } from './data-export.controller.js';
import { DataExportService } from './data-export.service.js';
import { LocalDiskStorageService, StorageService } from './storage.service.js';
import { ExportCleanupCron } from './cleanup.cron.js';
import { ProfileExportContributor } from './contributors/profile.contributor.js';
import { SettingsExportContributor } from './contributors/settings.contributor.js';
import { PrivacyExportContributor } from './contributors/privacy.contributor.js';
import { DevicesExportContributor } from './contributors/devices.contributor.js';

@Module({
  imports: [DiscoveryModule],
  controllers: [DataExportController],
  providers: [
    DataExportService,
    { provide: StorageService, useClass: LocalDiskStorageService },
    ExportCleanupCron,
    ProfileExportContributor,
    SettingsExportContributor,
    PrivacyExportContributor,
    DevicesExportContributor,
  ],
  exports: [DataExportService],
})
export class DataExportModule {}
