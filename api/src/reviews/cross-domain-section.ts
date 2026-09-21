import type { ActivityKind } from '../generated/prisma/enums.js';

/** The `domain` value of the built-in section every review carries. */
export const CROSS_DOMAIN_SECTION = 'cross_domain';

export interface ReviewSection {
  domain: string;
  status: 'ok' | 'error' | 'timeout';
  metrics?: Record<string, number | string | boolean | null>;
  highlights?: string[];
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * The built-in section describing what the signal engine did for the user in the
 * period, straight from the audit log. "Created" counts suggestions that waited on
 * the user; ones an `auto` connection applied straight away show up as auto-applied.
 */
export function buildCrossDomainSection(counts: Partial<Record<ActivityKind, number>>): ReviewSection {
  const metrics = {
    suggestionsCreated: counts.suggestion_created ?? 0,
    suggestionsApproved: counts.suggestion_approved ?? 0,
    suggestionsDismissed: counts.suggestion_dismissed ?? 0,
    suggestionsAutoApplied: counts.auto_applied ?? 0,
    suggestionsReverted: counts.reverted ?? 0,
    manualOverrides: counts.manual_override ?? 0,
  };

  const highlights: string[] = [];
  if (metrics.suggestionsApproved > 0) highlights.push(`You approved ${plural(metrics.suggestionsApproved, 'suggestion')}`);
  if (metrics.suggestionsAutoApplied > 0) highlights.push(`${plural(metrics.suggestionsAutoApplied, 'change')} applied automatically`);
  if (metrics.suggestionsDismissed > 0) highlights.push(`You dismissed ${plural(metrics.suggestionsDismissed, 'suggestion')}`);
  if (metrics.suggestionsReverted > 0) highlights.push(`${plural(metrics.suggestionsReverted, 'action')} undone`);
  if (metrics.manualOverrides > 0) highlights.push(`You corrected ${plural(metrics.manualOverrides, 'automatic change')} by hand`);

  return { domain: CROSS_DOMAIN_SECTION, status: 'ok', metrics, highlights };
}

export function crossDomainHasActivity(section: ReviewSection): boolean {
  return Object.values(section.metrics ?? {}).some((value) => typeof value === 'number' && value > 0);
}
