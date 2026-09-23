/**
 * Groups plausibly-identical, independently-created (non-recurring) tasks so
 * @SignalDetector('tasks-recurring-pattern') can notice "you keep creating this same
 * task" and propose turning it into a real recurring series. Two tasks fingerprint the
 * same when their titles are the same after normalizing whitespace/case - deliberately
 * simple and predictable, not fuzzy matching, so the same set of tasks always fingerprints
 * the same way across runs.
 */
export function taskFingerprint(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The typical gap between consecutive creation dates, in whole days, rounded to the
 * nearest integer. `dates` must have at least 2 entries, sorted ascending.
 */
export function averageCadenceDays(datesAscending: Date[]): number {
  if (datesAscending.length < 2) throw new Error('averageCadenceDays needs at least 2 dates');
  const first = datesAscending[0].getTime();
  const last = datesAscending.at(-1)!.getTime();
  const gaps = datesAscending.length - 1;
  return Math.max(1, Math.round((last - first) / gaps / 86_400_000));
}
