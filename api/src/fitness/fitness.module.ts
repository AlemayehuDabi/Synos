import { Module } from '@nestjs/common';
import { SignalEngineModule } from '../signal-engine/signal-engine.module.js';
import { BodyMetricService } from './body-metric.service.js';
import { BodyMetricsController } from './body-metrics.controller.js';
import { SleepPoorDetector } from './detectors/sleep-poor.detector.js';
import { TrainingHeavyDetector } from './detectors/training-heavy.detector.js';
import { ExerciseService } from './exercise.service.js';
import { ExercisesController } from './exercises.controller.js';
import {
  BodyMetricsExportContributor,
  ExercisesExportContributor,
  ProgramsExportContributor,
  ProgramWorkoutsExportContributor,
  WearableSamplesExportContributor,
  WorkoutExercisesExportContributor,
  WorkoutSetsExportContributor,
  WorkoutsExportContributor,
} from './export/fitness.contributors.js';
import { FitnessCalendarBlockContributor } from './fitness-calendar-block.contributor.js';
import { FitnessPrivacyService } from './fitness-privacy.service.js';
import { FitnessReviewContributor } from './fitness-review.contributor.js';
import { FitnessTodayContributor } from './fitness-today.contributor.js';
import { FitnessTombstoneRetentionCron } from './fitness-tombstone-retention.cron.js';
import { ProgramService } from './program.service.js';
import { ProgramsController } from './programs.controller.js';
import { WearableService } from './wearable.service.js';
import { WearablesController } from './wearables.controller.js';
import { WorkoutService } from './workout.service.js';
import { WorkoutsController } from './workouts.controller.js';

/**
 * Fitness owns workouts, exercises, programs, body metrics and wearable samples. It never
 * writes into another domain: it only emits signals (workout.completed on completion,
 * sleep.poor / training.heavy from its detectors) and exposes its own data read-only through
 * the Today, Review and Calendar-block contributors. The connections those signals feed
 * (workout-to-habit, recovery-to-task-load) are owned by the target domains, not here.
 */
@Module({
  imports: [SignalEngineModule],
  controllers: [WorkoutsController, ExercisesController, ProgramsController, BodyMetricsController, WearablesController],
  providers: [
    ExerciseService,
    WorkoutService,
    ProgramService,
    BodyMetricService,
    WearableService,
    FitnessPrivacyService,
    SleepPoorDetector,
    TrainingHeavyDetector,
    FitnessTodayContributor,
    FitnessReviewContributor,
    FitnessCalendarBlockContributor,
    FitnessTombstoneRetentionCron,
    ExercisesExportContributor,
    WorkoutsExportContributor,
    WorkoutExercisesExportContributor,
    WorkoutSetsExportContributor,
    ProgramsExportContributor,
    ProgramWorkoutsExportContributor,
    BodyMetricsExportContributor,
    WearableSamplesExportContributor,
  ],
})
export class FitnessModule {}
