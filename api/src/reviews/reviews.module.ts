import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SignalEngineModule } from '../signal-engine/signal-engine.module.js';
import { ReviewsExportContributor } from './export/review.contributor.js';
import { ReviewCollectorService } from './review-collector.service.js';
import { ReviewGenerationCron } from './review-generation.cron.js';
import { ReviewGenerationService } from './review-generation.service.js';
import { ReviewRegistryService } from './review-registry.service.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

/**
 * Weekly and monthly reviews. Domain modules plug in by declaring a
 * @ReviewContributor(domain) provider anywhere reachable from AppModule; this
 * module never changes.
 */
@Module({
  imports: [DiscoveryModule, SignalEngineModule, NotificationsModule],
  controllers: [ReviewsController],
  providers: [
    ReviewRegistryService,
    ReviewCollectorService,
    ReviewGenerationService,
    ReviewGenerationCron,
    ReviewsService,
    ReviewsExportContributor,
  ],
  exports: [ReviewGenerationService],
})
export class ReviewsModule {}
