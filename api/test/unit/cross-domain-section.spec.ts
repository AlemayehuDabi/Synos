import { describe, expect, it } from 'vitest';
import {
  buildCrossDomainSection,
  CROSS_DOMAIN_SECTION,
  crossDomainHasActivity,
} from '../../src/reviews/cross-domain-section.js';

describe('buildCrossDomainSection', () => {
  it('is an ok section named cross_domain with every metric present, even for an empty period', () => {
    const section = buildCrossDomainSection({});
    expect(section.domain).toBe(CROSS_DOMAIN_SECTION);
    expect(section.status).toBe('ok');
    expect(section.metrics).toEqual({
      suggestionsCreated: 0,
      suggestionsApproved: 0,
      suggestionsDismissed: 0,
      suggestionsAutoApplied: 0,
      suggestionsReverted: 0,
      manualOverrides: 0,
    });
    expect(section.highlights).toEqual([]);
    expect(crossDomainHasActivity(section)).toBe(false);
  });

  it('maps each audit-log kind to its metric', () => {
    const section = buildCrossDomainSection({
      suggestion_created: 7,
      suggestion_approved: 3,
      suggestion_dismissed: 2,
      auto_applied: 4,
      reverted: 1,
      manual_override: 5,
    });
    expect(section.metrics).toEqual({
      suggestionsCreated: 7,
      suggestionsApproved: 3,
      suggestionsDismissed: 2,
      suggestionsAutoApplied: 4,
      suggestionsReverted: 1,
      manualOverrides: 5,
    });
    expect(crossDomainHasActivity(section)).toBe(true);
  });

  it('ignores kinds it does not report on', () => {
    const section = buildCrossDomainSection({ suggestion_expired: 9 } as never);
    expect(crossDomainHasActivity(section)).toBe(false);
  });

  it('writes highlights only for what happened, with correct plurals', () => {
    const section = buildCrossDomainSection({ suggestion_approved: 1, manual_override: 2 });
    expect(section.highlights).toEqual(['You approved 1 suggestion', 'You corrected 2 automatic changes by hand']);
  });

  it('counts a period with only created suggestions as active', () => {
    expect(crossDomainHasActivity(buildCrossDomainSection({ suggestion_created: 1 }))).toBe(true);
  });
});
