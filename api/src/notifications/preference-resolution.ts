import type { NotificationCategory } from '../generated/prisma/enums.js';
import { NOTIFICATION_CATEGORIES } from './categories.js';

export interface ChannelPreference {
  inApp: boolean;
  push: boolean;
}

export type ResolvedPreferences = Record<NotificationCategory, ChannelPreference>;

/** Everything is on until the user turns it off. */
export const DEFAULT_CHANNEL_PREFERENCE: Readonly<ChannelPreference> = { inApp: true, push: true };

/**
 * Effective preference for every category: the user's stored choice where there is
 * one, the default otherwise. A category never appears as "unknown".
 */
export function resolvePreferences(
  stored: readonly { category: NotificationCategory; inApp: boolean; push: boolean }[],
): ResolvedPreferences {
  const byCategory = new Map(stored.map((row) => [row.category, row]));
  return Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((category) => {
      const row = byCategory.get(category);
      return [category, row ? { inApp: row.inApp, push: row.push } : { ...DEFAULT_CHANNEL_PREFERENCE }];
    }),
  ) as ResolvedPreferences;
}
