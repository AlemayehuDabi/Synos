import { localDateInTimezone } from '../common/time/timezone.js';

export interface SleepSampleInput {
  startsAt: Date;
  endsAt: Date;
  value: unknown;
}

export interface SleepNight {
  /** The local date (in the user's timezone) the night ended on, "YYYY-MM-DD". */
  date: string;
  durationMinutes: number;
  sampleCount: number;
  poor: boolean;
}

/** Minutes asleep for one sample: what the device reported, else the length of its interval. */
export function sleepSampleMinutes(sample: SleepSampleInput): number {
  const reported = (sample.value as { durationMinutes?: unknown } | null)?.durationMinutes;
  if (typeof reported === 'number' && Number.isFinite(reported) && reported >= 0) return Math.round(reported);
  return Math.max(0, Math.round((sample.endsAt.getTime() - sample.startsAt.getTime()) / 60_000));
}

/**
 * Groups sleep samples into nights by the local date each one ended on and totals them.
 * A sample that starts before the previous kept one ended is dropped, so the same stretch
 * reported by two devices is only counted once. This is the single source of truth for
 * both GET /wearables/sleep and the sleep.poor detector.
 */
export function summarizeSleepNights(samples: SleepSampleInput[], timezone: string, thresholdMinutes: number): SleepNight[] {
  const ordered = [...samples].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || b.endsAt.getTime() - a.endsAt.getTime(),
  );

  const nights = new Map<string, { durationMinutes: number; sampleCount: number }>();
  let lastEnd = Number.NEGATIVE_INFINITY;
  for (const sample of ordered) {
    if (sample.startsAt.getTime() < lastEnd) continue;
    lastEnd = sample.endsAt.getTime();
    const date = localDateInTimezone(sample.endsAt, timezone);
    const night = nights.get(date) ?? { durationMinutes: 0, sampleCount: 0 };
    night.durationMinutes += sleepSampleMinutes(sample);
    night.sampleCount += 1;
    nights.set(date, night);
  }

  return [...nights.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, night]) => ({ date, ...night, poor: isSleepPoor(night.durationMinutes, thresholdMinutes) }));
}

export function isSleepPoor(durationMinutes: number, thresholdMinutes: number): boolean {
  return durationMinutes < thresholdMinutes;
}
