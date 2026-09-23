import { Module } from '@nestjs/common';
import { SignalEngineModule } from '../signal-engine/signal-engine.module.js';
import { RecurringTaskToHabitHandler, RecurringTaskToHabitRule } from './connections/recurring-task-to-habit.js';
import { WorkoutToHabitHandler, WorkoutToHabitRule } from './connections/workout-to-habit.js';
import { HabitEntriesExportContributor, HabitsExportContributor } from './export/habit.contributors.js';
import { HabitEntryService } from './habit-entry.service.js';
import { HabitReviewContributor } from './habit-review.contributor.js';
import { HabitStatsService } from './habit-stats.service.js';
import { HabitTodayContributor } from './habit-today.contributor.js';
import { HabitTombstoneRetentionCron } from './habit-tombstone-retention.cron.js';
import { HabitService } from './habit.service.js';
import { HabitsController } from './habits.controller.js';

/**
 * Habits owns hard Habit/HabitEntry records. Manual check-ins/slips are ground truth: a
 * manual entry write for a date with a pending/auto-applied suggestion for that habit
 * supersedes it (see connections/). Habits never writes into another domain's data, and
 * exposes nothing as calendar blocks - habits are not scheduled events.
 */
@Module({
  imports: [SignalEngineModule],
  controllers: [HabitsController],
  providers: [
    HabitService,
    HabitEntryService,
    HabitStatsService,
    HabitTodayContributor,
    HabitReviewContributor,
    WorkoutToHabitRule,
    WorkoutToHabitHandler,
    RecurringTaskToHabitRule,
    RecurringTaskToHabitHandler,
    HabitsExportContributor,
    HabitEntriesExportContributor,
    HabitTombstoneRetentionCron,
  ],
})
export class HabitsModule {}
