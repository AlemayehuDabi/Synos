import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationPreferencesController } from './controllers/notification-preferences.controller.js';
import { NotificationsController } from './controllers/notifications.controller.js';
import {
  NotificationPreferencesExportContributor,
  NotificationsExportContributor,
} from './export/notification.contributors.js';
import { InboxNotifier } from './inbox-notifier.js';
import { NotificationPreferencesService } from './notification-preferences.service.js';
import { NotificationRetentionCron } from './notification-retention.cron.js';
import { NotificationsFacade } from './notifications.facade.js';
import { NotificationsService } from './notifications.service.js';
import { DevPushProvider } from './push/dev-push.provider.js';
import { PUSH_PROVIDER, type PushProvider } from './push/push-provider.js';
import { PushThrottleService } from './push/push-throttle.service.js';
import { PushService } from './push/push.service.js';

/**
 * Other modules import this and call NotificationsFacade.notify(); nothing else
 * here is meant to be used from outside.
 */
@Module({
  controllers: [NotificationsController, NotificationPreferencesController],
  providers: [
    NotificationsFacade,
    NotificationsService,
    NotificationPreferencesService,
    PushService,
    PushThrottleService,
    InboxNotifier,
    NotificationRetentionCron,
    NotificationsExportContributor,
    NotificationPreferencesExportContributor,
    // Chosen by PUSH_PROVIDER. Only "dev" exists (logs to the console). To send real pushes:
    // implement PushProvider for FCM/APNs, add its name to PUSH_PROVIDER in config/env.schema.ts,
    // and add a case here - see "Sending real pushes" in the README.
    {
      provide: PUSH_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PushProvider => {
        switch (config.get<'dev'>('PUSH_PROVIDER', 'dev')) {
          case 'dev':
            return new DevPushProvider();
        }
      },
    },
  ],
  exports: [NotificationsFacade],
})
export class NotificationsModule {}
