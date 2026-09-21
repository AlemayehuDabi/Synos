import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { SignalEngineModule } from '../signal-engine/signal-engine.module.js';
import { TodayAggregatorService } from './today-aggregator.service.js';
import { TodayRegistryService } from './today-registry.service.js';
import { TodayController } from './today.controller.js';
import { TodayService } from './today.service.js';

/**
 * GET /today. Domain modules plug in by declaring a @TodayContributor(domain)
 * provider anywhere reachable from AppModule; this module never changes.
 */
@Module({
  imports: [DiscoveryModule, SignalEngineModule],
  controllers: [TodayController],
  providers: [TodayRegistryService, TodayAggregatorService, TodayService],
})
export class TodayModule {}
