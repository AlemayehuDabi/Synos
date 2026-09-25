import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { addDaysToDate, daysBetweenDates, localDateInTimezone, startOfLocalDay } from '../common/time/timezone.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../lib/prisma.js';
import type { IngestSamplesDto } from './dto/wearable.dto.js';
import { summarizeSleepNights, type SleepNight } from './sleep.js';
import { dedupeBatch, detectWorkoutConflict, validateSampleValue } from './wearable.js';

const MAX_SLEEP_RANGE_DAYS = 90;
/** A workout can't run longer than this, so a manual one starting earlier than this before a sample can't overlap it. */
const MAX_WORKOUT_LOOKBACK_MS = 24 * 60 * 60_000;

export interface IngestResult {
  received: number;
  created: number;
  duplicates: number;
  conflicts: number;
}

export interface SleepResult {
  from: string;
  to: string;
  timezone: string;
  thresholdMinutes: number;
  nights: SleepNight[];
}

@Injectable()
export class WearableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Stores a batch of device samples, ignoring any whose dedupeKey is already stored (or repeated in the
   * batch). Samples are always separate rows: a `workout` sample that overlaps a manual workout but
   * disagrees with it is flagged as a conflict and never changes the manual workout.
   */
  async ingest(userId: string, dto: IngestSamplesDto): Promise<IngestResult> {
    const samples = dto.samples.map((sample, index) => {
      const startsAt = new Date(sample.startsAt);
      const endsAt = new Date(sample.endsAt);
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) throw new BadRequestException(`samples[${index}] has an invalid startsAt/endsAt`);
      if (endsAt < startsAt) throw new BadRequestException(`samples[${index}].endsAt must not be before startsAt`);
      const problem = validateSampleValue(sample.type, sample.value);
      if (problem) throw new BadRequestException(`samples[${index}].value is invalid for type "${sample.type}" - ${problem}`);
      return { type: sample.type, startsAt, endsAt, value: sample.value, sourceDevice: sample.sourceDevice, dedupeKey: sample.dedupeKey };
    });

    const { unique } = dedupeBatch(samples);
    const stored = await this.prisma.wearableSample.findMany({
      where: { userId, dedupeKey: { in: unique.map((sample) => sample.dedupeKey) } },
      select: { dedupeKey: true },
    });
    const storedKeys = new Set(stored.map((row) => row.dedupeKey));
    const fresh = unique.filter((sample) => !storedKeys.has(sample.dedupeKey));

    const manualWorkouts = await this.manualWorkoutsAround(userId, fresh.filter((sample) => sample.type === 'workout'));
    const rows = fresh.map((sample) => {
      const conflictWorkoutId = sample.type === 'workout' ? detectWorkoutConflict(sample, manualWorkouts) : null;
      return {
        userId,
        type: sample.type,
        startsAt: sample.startsAt,
        endsAt: sample.endsAt,
        value: sample.value as Prisma.InputJsonValue,
        sourceDevice: sample.sourceDevice,
        dedupeKey: sample.dedupeKey,
        conflict: conflictWorkoutId !== null,
        conflictWorkoutId,
      };
    });

    const { count } = rows.length > 0 ? await this.prisma.wearableSample.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
    return {
      received: samples.length,
      created: count,
      duplicates: samples.length - count,
      conflicts: rows.filter((row) => row.conflict).length,
    };
  }

  /** Nightly sleep totals by wake-up date - the same summary the sleep.poor detector evaluates. */
  async sleep(userId: string, range: { from?: string; to?: string }): Promise<SleepResult> {
    const timezone = await this.timezoneOf(userId);
    const to = range.to ?? localDateInTimezone(new Date(), timezone);
    const from = range.from ?? addDaysToDate(to, -6);
    if (from > to) throw new BadRequestException('from must not be after to');
    if (daysBetweenDates(from, to) >= MAX_SLEEP_RANGE_DAYS) throw new BadRequestException(`The range may span at most ${MAX_SLEEP_RANGE_DAYS} days`);

    const rows = await this.prisma.wearableSample.findMany({
      where: { userId, type: 'sleep', endsAt: { gte: startOfLocalDay(from, timezone), lt: startOfLocalDay(addDaysToDate(to, 1), timezone) } },
      select: { startsAt: true, endsAt: true, value: true },
    });
    const thresholdMinutes = this.config.get<number>('FITNESS_SLEEP_POOR_THRESHOLD_MIN', 360);
    return { from, to, timezone, thresholdMinutes, nights: summarizeSleepNights(rows, timezone, thresholdMinutes) };
  }

  private async manualWorkoutsAround(userId: string, workoutSamples: { startsAt: Date; endsAt: Date }[]) {
    if (workoutSamples.length === 0) return [];
    const earliest = Math.min(...workoutSamples.map((sample) => sample.startsAt.getTime()));
    const latest = Math.max(...workoutSamples.map((sample) => sample.endsAt.getTime()));
    return this.prisma.workout.findMany({
      where: { userId, source: 'manual', deletedAt: null, startedAt: { gte: new Date(earliest - MAX_WORKOUT_LOOKBACK_MS), lte: new Date(latest) } },
      select: { id: true, workoutType: true, startedAt: true, completedAt: true, durationMinutes: true },
    });
  }

  private async timezoneOf(userId: string): Promise<string> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId }, select: { timezone: true } });
    return settings?.timezone ?? 'UTC';
  }
}
