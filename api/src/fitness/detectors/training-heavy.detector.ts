import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { localDateInTimezone } from '../../common/time/timezone.js';
import { PrismaService } from '../../lib/prisma.js';
import { SignalDetector } from '../../signal-engine/registry/index.js';
import { SignalEngineFacade } from '../../signal-engine/signal-engine.facade.js';
import { isHeavyLoad, LOAD_WINDOW_DAYS, trainingLoad, type LoadWorkout } from '../training-load.js';
import { timezonesFor } from './timezones.js';

/**
 * Emits `training.heavy` for a user whose completed workouts over the last 7 days add up to at
 * least FITNESS_HEAVY_LOAD_THRESHOLD (see training-load.ts). At most once per day per user: the
 * signal's dedupeKey is the user's local date, so every later tick that day is a no-op at the engine.
 */
@Injectable()
@SignalDetector({ name: 'fitness-training-heavy', cron: '0 40 * * * *' })
export class TrainingHeavyDetector implements SignalDetector {
  private readonly logger = new Logger(TrainingHeavyDetector.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signalEngine: SignalEngineFacade,
    private readonly config: ConfigService,
  ) {}

  async run(): Promise<void> {
    const now = new Date();
    const threshold = this.config.get<number>('FITNESS_HEAVY_LOAD_THRESHOLD', 2500);
    const since = new Date(now.getTime() - LOAD_WINDOW_DAYS * 24 * 60 * 60_000);

    const rows = await this.prisma.workout.findMany({
      where: { deletedAt: null, completedAt: { not: null, gte: since } },
      select: {
        userId: true,
        durationMinutes: true,
        startedAt: true,
        completedAt: true,
        exercises: { select: { sets: { select: { rpe: true } } } },
      },
    });

    const byUser = new Map<string, LoadWorkout[]>();
    for (const row of rows) {
      const rpes = row.exercises.flatMap((exercise) => exercise.sets.flatMap((set) => (set.rpe == null ? [] : [set.rpe])));
      byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), { durationMinutes: row.durationMinutes, startedAt: row.startedAt, completedAt: row.completedAt, rpes }]);
    }
    const timezones = await timezonesFor(this.prisma, [...byUser.keys()]);

    for (const [userId, workouts] of byUser) {
      const load = trainingLoad(workouts);
      if (!isHeavyLoad(load, threshold)) continue;

      const date = localDateInTimezone(now, timezones.get(userId) ?? 'UTC');
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.signalEngine.emit({
          userId,
          type: 'training.heavy',
          payload: { date, loadScore: load, windowDays: LOAD_WINDOW_DAYS },
          dedupeKey: `training-heavy:${date}`,
        });
      } catch (error) {
        // Ids only: never log health data.
        this.logger.warn(`Could not emit training.heavy for user ${userId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}
