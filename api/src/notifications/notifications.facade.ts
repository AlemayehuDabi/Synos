import { Injectable } from '@nestjs/common';
import type { NotificationCategory, SignalDomain } from '../generated/prisma/enums.js';
import { NotificationPreferencesService } from './notification-preferences.service.js';
import { NotificationsService } from './notifications.service.js';
import { toPushData } from './push/push-data.js';
import { PushService } from './push/push.service.js';

export interface NotifyInput {
  userId: string;
  category: NotificationCategory;
  domain?: SignalDomain;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Makes notify() idempotent for this user: a repeat neither stores nor pushes again. */
  dedupeKey?: string;
}

export interface NotifyResult {
  /** The stored in-app notification; null when the user has turned in-app off for this category. */
  notification: { id: string } | null;
  /** False when `dedupeKey` matched a notification that already exists. */
  created: boolean;
  /** Whether a push was handed to the delivery queue (it may still fail or be retried there). */
  pushQueued: boolean;
}

/**
 * The only entry point other modules use to tell a user something.
 *
 * It stores an in-app notification, then queues a push to the user's devices.
 * The user's per-category preferences decide which of the two happen, and quiet
 * hours suppress the push only - never the in-app notification.
 */
@Injectable()
export class NotificationsFacade {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly preferences: NotificationPreferencesService,
    private readonly push: PushService,
  ) {}

  async notify(input: NotifyInput): Promise<NotifyResult> {
    const context = await this.preferences.loadForDelivery(input.userId);
    const channel = context.preferences[input.category];

    let notification: { id: string } | null = null;
    if (channel.inApp) {
      const stored = await this.notifications.store(input);
      notification = stored.notification;
      if (!stored.created) return { notification, created: false, pushQueued: false };
    }

    const pushQueued = channel.push
      ? await this.push.pushToUser(
          input.userId,
          {
            title: input.title,
            body: input.body,
            data: toPushData(
              {
                category: input.category,
                ...(notification ? { notificationId: notification.id } : {}),
                ...(input.domain ? { domain: input.domain } : {}),
              },
              input.data,
            ),
          },
          { category: input.category, timezone: context.timezone, quietHours: context.quietHours },
        )
      : false;

    return { notification, created: true, pushQueued };
  }
}
