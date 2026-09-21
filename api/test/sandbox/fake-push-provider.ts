import type { PushMessage, PushProvider, PushResult } from '../../src/notifications/push/push-provider.js';

/**
 * Stands in for FCM/APNs. `sent` holds what the provider accepted; `attempts` every
 * call, including failed ones. Tokens can be declared dead, or made to fail transiently.
 */
export class FakePushProvider implements PushProvider {
  readonly sent: PushMessage[] = [];
  readonly attempts: PushMessage[] = [];
  private readonly invalidTokens = new Set<string>();
  private readonly transientFailures = new Map<string, number>();

  markInvalid(token: string): void {
    this.invalidTokens.add(token);
  }

  /** The next `times` calls for this token throw, as a timeout or 5xx from the real service would. */
  failTransiently(token: string, times: number): void {
    this.transientFailures.set(token, times);
  }

  async send(message: PushMessage): Promise<PushResult> {
    this.attempts.push(message);
    const remaining = this.transientFailures.get(message.token) ?? 0;
    if (remaining > 0) {
      this.transientFailures.set(message.token, remaining - 1);
      throw new Error('provider unavailable');
    }
    if (this.invalidTokens.has(message.token)) return { outcome: 'invalid_token' };
    this.sent.push(message);
    return { outcome: 'sent' };
  }

  reset(): void {
    this.sent.length = 0;
    this.attempts.length = 0;
    this.invalidTokens.clear();
    this.transientFailures.clear();
  }
}
