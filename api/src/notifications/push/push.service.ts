import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobRunner } from '../../common/jobs/job-runner.js';
import { PrismaService } from '../../lib/prisma.js';
import type { NotificationCategory } from '../../generated/prisma/enums.js';
import { isWithinQuietHours, type QuietHours } from '../quiet-hours.js';
import { PUSH_PROVIDER, type PushMessage, type PushProvider } from './push-provider.js';
import { PushThrottleService } from './push-throttle.service.js';

export interface PushPayload {
  title: string;
  body: string;
  data: Record<string, string>;
}

export interface PushDelivery {
  category: NotificationCategory;
  timezone: string;
  quietHours: QuietHours | null;
  /** 0 disables the per-category rate limit. */
  minIntervalSeconds?: number;
  now?: Date;
}

interface Device {
  id: string;
  platform: PushMessage['platform'];
  pushToken: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobRunner: JobRunner,
    private readonly throttle: PushThrottleService,
    private readonly config: ConfigService,
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
  ) {}

  /**
   * Queues a push to all of the user's devices, unless it must be held back: it is
   * quiet hours for them, they have no devices, or one went out for this category
   * too recently. Returns whether anything was queued. The rate-limit slot is only
   * taken once a push will really be sent, so a suppressed push never burns it.
   */
  async pushToUser(userId: string, payload: PushPayload, delivery: PushDelivery): Promise<boolean> {
    const now = delivery.now ?? new Date();
    if (isWithinQuietHours(now, delivery.timezone, delivery.quietHours)) return false;

    const devices = await this.prisma.device.findMany({
      where: { userId },
      select: { id: true, platform: true, pushToken: true },
    });
    if (devices.length === 0) return false;

    if (delivery.minIntervalSeconds && !(await this.throttle.claim(userId, delivery.category, delivery.minIntervalSeconds, now))) {
      return false;
    }

    this.jobRunner.run(async () => {
      await Promise.all(devices.map((device) => this.deliver(device, payload)));
    });
    return true;
  }

  private async deliver(device: Device, payload: PushPayload): Promise<void> {
    const maxAttempts = this.config.get<number>('PUSH_MAX_ATTEMPTS', 3);
    const baseDelayMs = this.config.get<number>('PUSH_RETRY_BASE_DELAY_MS', 1000);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await this.provider.send({
          token: device.pushToken,
          platform: device.platform,
          ...payload,
        });
        if (result.outcome === 'invalid_token') {
          // Match on the token too: the row may since have been re-registered to another user.
          await this.prisma.device.deleteMany({ where: { id: device.id, pushToken: device.pushToken } });
          this.logger.log(`Removed device ${device.id}: its push token is no longer valid`);
        }
        return;
      } catch {
        if (attempt === maxAttempts) {
          this.logger.warn(`Giving up on a push to device ${device.id} after ${maxAttempts} attempts`);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
      }
    }
  }
}
