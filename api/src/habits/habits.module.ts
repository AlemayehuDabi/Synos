import { Module } from '@nestjs/common';
import { HabitEntryService } from './habit-entry.service.js';
import { HabitService } from './habit.service.js';
import { HabitsController } from './habits.controller.js';

/**
 * Habits owns hard Habit/HabitEntry records. Manual check-ins/slips are ground truth: a
 * manual entry write for a date with a pending/auto-applied suggestion for that habit
 * supersedes it (see connections/). Habits never writes into another domain's data, and
 * exposes nothing as calendar blocks - habits are not scheduled events.
 */
@Module({
  controllers: [HabitsController],
  providers: [HabitService, HabitEntryService],
})
export class HabitsModule {}
