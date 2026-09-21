import { Module } from '@nestjs/common';
import { DataExportModule } from '../data-export/data-export.module.js';
import { MeController } from './me.controller.js';
import { SettingsController } from './settings.controller.js';
import { PrivacyController } from './privacy.controller.js';
import { MeService } from './me.service.js';
import { SettingsService } from './settings.service.js';
import { PrivacyService } from './privacy.service.js';
import { AccountDeletionService } from './account-deletion.service.js';

@Module({
  imports: [DataExportModule],
  controllers: [MeController, SettingsController, PrivacyController],
  providers: [MeService, SettingsService, PrivacyService, AccountDeletionService],
})
export class MeModule {}
