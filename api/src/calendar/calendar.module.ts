import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { CalendarBlockAggregatorService } from './calendar-block-aggregator.service.js';
import { CalendarBlockRegistryService } from './calendar-block-registry.service.js';
import { CalendarController } from './calendar.controller.js';
import { CalendarEventService } from './calendar-event.service.js';
import { CalendarFreeSlotsService } from './calendar-free-slots.service.js';
import { CalendarReviewContributor } from './calendar-review.contributor.js';
import { CalendarTodayContributor } from './calendar-today.contributor.js';
import { CalendarTombstoneRetentionCron } from './calendar-tombstone-retention.cron.js';
import { CalendarViewService } from './calendar-view.service.js';
import { CalendarEventExceptionsExportContributor, CalendarEventsExportContributor } from './export/calendar.contributor.js';

/**
 * Calendar owns only hard events (CalendarEvent/CalendarEventException). Everything else -
 * "today's events", "this period's calendar review", soft read-only blocks from other
 * domains - is either exposed here for other modules to consume (@TodayContributor,
 * @ReviewContributor) or consumed here from other domains (@CalendarBlockContributor,
 * discovered the same way). This module never writes into another domain's data, and no
 * domain writes into Calendar.
 */
@Module({
  imports: [DiscoveryModule],
  controllers: [CalendarController],
  providers: [
    CalendarBlockRegistryService,
    CalendarBlockAggregatorService,
    CalendarEventService,
    CalendarViewService,
    CalendarFreeSlotsService,
    CalendarTodayContributor,
    CalendarReviewContributor,
    CalendarTombstoneRetentionCron,
    CalendarEventsExportContributor,
    CalendarEventExceptionsExportContributor,
  ],
  exports: [CalendarEventService],
})
export class CalendarModule {}
