import { Module } from '@nestjs/common';
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
import { PUSH_PROVIDER } from './push/push-provider.js';
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
    // Only "dev" exists (logs to the console). To send real pushes, add a class implementing
    // PushProvider for FCM/APNs and choose it here from PUSH_PROVIDER.
    { provide: PUSH_PROVIDER, useClass: DevPushProvider },
  ],
  exports: [NotificationsFacade],
})
export class NotificationsModule {}
