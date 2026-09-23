import { Module } from '@nestjs/common';
import { SignalEngineModule } from '../signal-engine/signal-engine.module.js';
import { BillToReminderHandler, BillToReminderRule } from './connections/bill-to-reminder.js';
import { RecoveryToTaskLoadHandler, RecoveryToTaskLoadRule } from './connections/recovery-to-task-load.js';
import { TaskMissedDetector } from './detectors/task-missed.detector.js';
import { TaskRecurringPatternDetector } from './detectors/task-recurring-pattern.detector.js';
import { SubtasksExportContributor, TaskExceptionsExportContributor, TasksExportContributor } from './export/task.contributors.js';
import { SubtaskService } from './subtask.service.js';
import { TaskCalendarBlockContributor } from './task-calendar-block.contributor.js';
import { TaskReviewContributor } from './task-review.contributor.js';
import { TaskService } from './task.service.js';
import { TaskTodayContributor } from './task-today.contributor.js';
import { TaskTombstoneRetentionCron } from './task-tombstone-retention.cron.js';
import { TasksController } from './tasks.controller.js';

/**
 * Tasks owns hard Task/TaskException/Subtask records. It exposes scheduled tasks to
 * Calendar as read-only soft blocks and contributes to Today/Review the same way every
 * other domain module does (@TodayContributor/@ReviewContributor/@CalendarBlockContributor,
 * discovered by those modules' own registries - this module never imports them). It emits
 * signals via SignalEngineFacade and supplies the @ConnectionRule/@ActionHandler providers
 * for bill-to-reminder and recovery-to-task-load, discovered the same way by
 * SignalEngineModule's own registry. Tasks never writes into another domain's data.
 */
@Module({
  imports: [SignalEngineModule],
  controllers: [TasksController],
  providers: [
    TaskService,
    SubtaskService,
    TaskTodayContributor,
    TaskReviewContributor,
    TaskCalendarBlockContributor,
    TaskMissedDetector,
    TaskRecurringPatternDetector,
    BillToReminderRule,
    BillToReminderHandler,
    RecoveryToTaskLoadRule,
    RecoveryToTaskLoadHandler,
    TaskTombstoneRetentionCron,
    TasksExportContributor,
    TaskExceptionsExportContributor,
    SubtasksExportContributor,
  ],
})
export class TasksModule {}
