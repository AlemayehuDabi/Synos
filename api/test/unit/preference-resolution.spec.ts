import { describe, expect, it } from 'vitest';
import { NOTIFICATION_CATEGORIES } from '../../src/notifications/categories.js';
import { DEFAULT_CHANNEL_PREFERENCE, resolvePreferences } from '../../src/notifications/preference-resolution.js';

describe('resolvePreferences', () => {
  it('covers every category, all on, when the user has stored nothing', () => {
    const resolved = resolvePreferences([]);
    expect(Object.keys(resolved).sort()).toEqual([...NOTIFICATION_CATEGORIES].sort());
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(resolved[category]).toEqual({ inApp: true, push: true });
    }
  });

  it('knows the five categories the spec lists', () => {
    expect([...NOTIFICATION_CATEGORIES].sort()).toEqual(['bill', 'inbox_suggestion', 'reminder', 'review_ready', 'system']);
  });

  it('applies a stored choice to its category only', () => {
    const resolved = resolvePreferences([{ category: 'bill', inApp: true, push: false }]);
    expect(resolved.bill).toEqual({ inApp: true, push: false });
    expect(resolved.reminder).toEqual({ inApp: true, push: true });
    expect(resolved.inbox_suggestion).toEqual({ inApp: true, push: true });
  });

  it('keeps the two channels independent', () => {
    const resolved = resolvePreferences([
      { category: 'reminder', inApp: false, push: true },
      { category: 'system', inApp: false, push: false },
    ]);
    expect(resolved.reminder).toEqual({ inApp: false, push: true });
    expect(resolved.system).toEqual({ inApp: false, push: false });
  });

  it('hands out copies, so changing a result never changes the defaults', () => {
    const first = resolvePreferences([]);
    first.bill.push = false;
    expect(resolvePreferences([]).bill).toEqual(DEFAULT_CHANNEL_PREFERENCE);
    expect(DEFAULT_CHANNEL_PREFERENCE).toEqual({ inApp: true, push: true });
  });
});
