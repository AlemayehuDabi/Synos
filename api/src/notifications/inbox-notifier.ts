import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { SUGGESTIONS_CREATED_EVENT, type SuggestionsCreatedEvent } from '../signal-engine/events.js';
import { NotificationPreferencesService } from './notification-preferences.service.js';
import { NotificationsService } from './notifications.service.js';
import { toPushData } from './push/push-data.js';
import { PushService } from './push/push.service.js';

const CATEGORY = 'inbox_suggestion' as const;

/**
 * Turns "the signal engine left suggestions waiting for the user" into notifications.
 *
 * Every suggestion gets its own in-app notification (deduped on the suggestion id,
 * so reprocessing never duplicates one). Pushes are batched: one push per event
 * however many suggestions it carries, and at most one per
 * INBOX_PUSH_MIN_INTERVAL_SECONDS per user across events - a burst of suggestions
 * buzzes the phone once, not once each.
 */
@Injectable()
export class InboxNotifier {
  private readonly logger = new Logger(InboxNotifier.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly preferences: NotificationPreferencesService,
    private readonly push: PushService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent(SUGGESTIONS_CREATED_EVENT)
  async onSuggestionsCreated(event: SuggestionsCreatedEvent): Promise<void> {
    try {
      await this.notify(event);
    } catch {
      // Ids only, never titles: they are user data.
      this.logger.warn(`Could not notify user ${event.userId} about ${event.suggestions.length} suggestion(s)`);
    }
  }

  private async notify({ userId, suggestions }: SuggestionsCreatedEvent): Promise<void> {
    const context = await this.preferences.loadForDelivery(userId);
    const channel = context.preferences[CATEGORY];

    // Only announce what is actually new: with in-app on, that is what the dedupe key lets through.
    let announced = suggestions;
    if (channel.inApp) {
      const fresh: typeof suggestions = [];
      for (const suggestion of suggestions) {
        const { created } = await this.notifications.store({
          userId,
          category: CATEGORY,
          domain: suggestion.targetDomain,
          title: 'New suggestion',
          body: suggestion.title,
          data: { suggestionId: suggestion.id, connectionId: suggestion.connectionId },
          dedupeKey: `suggestion:${suggestion.id}`,
        });
        if (created) fresh.push(suggestion);
      }
      announced = fresh;
    }
    if (announced.length === 0 || !channel.push) return;

    const [first] = announced;
    const single = announced.length === 1;
    await this.push.pushToUser(
      userId,
      {
        title: single ? 'New suggestion' : `${announced.length} new suggestions`,
        body: single ? first.title : announced.map((suggestion) => suggestion.title).join(', '),
        data: toPushData({ category: CATEGORY }, single ? { suggestionId: first.id } : { count: announced.length }),
      },
      {
        category: CATEGORY,
        timezone: context.timezone,
        quietHours: context.quietHours,
        minIntervalSeconds: this.config.get<number>('INBOX_PUSH_MIN_INTERVAL_SECONDS', 60),
      },
    );
  }
}
