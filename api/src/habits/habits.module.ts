import { Module } from '@nestjs/common';
import { SignalEngineModule } from '../signal-engine/signal-engine.module.js';
import { RecurringTaskToHabitHandler, RecurringTaskToHabitRule } from './connections/recurring-task-to-habit.js';
import { WorkoutToHabitHandler, WorkoutToHabitRule } from './connections/workout-to-habit.js';
import { HabitEntryService } from './habit-entry.service.js';
import { HabitStatsService } from './habit-stats.service.js';
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
    WorkoutToHabitRule,
    WorkoutToHabitHandler,
    RecurringTaskToHabitRule,
    RecurringTaskToHabitHandler,
  ],
})
export class HabitsModule {}
