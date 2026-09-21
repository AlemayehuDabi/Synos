import { Injectable, Logger } from '@nestjs/common';
import type { PushMessage, PushProvider, PushResult } from './push-provider.js';

/**
 * Logs pushes to the console instead of sending them. Development only: it prints
 * the title, which a real deployment should treat as user data. To send real pushes,
 * implement PushProvider with FCM (Android) and APNs (iOS) - map an
 * "unregistered"/"BadDeviceToken" reply to { outcome: 'invalid_token' }, throw on
 * anything retryable - and bind it to PUSH_PROVIDER in NotificationsModule.
 */
@Injectable()
export class DevPushProvider implements PushProvider {
  private readonly logger = new Logger('Push');

  async send(message: PushMessage): Promise<PushResult> {
    this.logger.log(`${message.platform} device ...${message.token.slice(-4)}: "${message.title}"`);
    return { outcome: 'sent' };
  }
}
