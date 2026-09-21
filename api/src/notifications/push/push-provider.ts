export type PushPlatform = 'ios' | 'android';

export interface PushMessage {
  token: string;
  platform: PushPlatform;
  title: string;
  body: string;
  /** FCM/APNs custom data is string-only, so values are stringified before they get here. */
  data: Record<string, string>;
}

/**
 * `invalid_token` means the token is permanently dead (unregistered, app
 * uninstalled): the device row is removed. Anything transient - a timeout, a 5xx,
 * a rate limit - should be *thrown*, which is what triggers the retries.
 */
export type PushResult = { outcome: 'sent' } | { outcome: 'invalid_token' };

export interface PushProvider {
  send(message: PushMessage): Promise<PushResult>;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
