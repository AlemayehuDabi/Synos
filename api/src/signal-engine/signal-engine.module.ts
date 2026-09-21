import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { FastPathListener } from './bus/fast-path.listener.js';
import { DetectorRunnerService } from './bus/detector-runner.service.js';
import { RetentionCron } from './bus/retention.cron.js';
import { SignalProcessorService } from './bus/signal-processor.service.js';
import { SweeperCron } from './bus/sweeper.cron.js';
import { ActivityController } from './controllers/activity.controller.js';
import { ConnectionsController } from './controllers/connections.controller.js';
import { InboxController } from './controllers/inbox.controller.js';
import { SignalsController } from './controllers/signals.controller.js';
import {
  ActivityLogExportContributor,
  ConnectionSettingsExportContributor,
  SignalsExportContributor,
  SuggestionsExportContributor,
} from './export/signal-engine.contributors.js';
import { SignalRegistryService } from './registry/registry.service.js';
import { ActivityService } from './services/activity.service.js';
import { ConnectionsService } from './services/connections.service.js';
import { SignalsService } from './services/signals.service.js';
import { SuggestionsService } from './services/suggestions.service.js';
import { SignalEngineFacade } from './signal-engine.facade.js';

/**
 * The engine domain modules (tasks, habits, fitness, finances, meals,
 * calendar) plug into: import SignalEngineFacade to emit signals, and declare
 * @ConnectionRule/@ActionHandler/@SignalDetector providers anywhere reachable
 * from AppModule - the registry inside this module discovers them, this
 * module's own code never needs to change.
 */
@Module({
  imports: [DiscoveryModule],
  controllers: [SignalsController, InboxController, ConnectionsController, ActivityController],
  providers: [
    SignalRegistryService,
    SignalsService,
    SuggestionsService,
    ConnectionsService,
    ActivityService,
    SignalEngineFacade,
    SignalProcessorService,
    FastPathListener,
    SweeperCron,
    DetectorRunnerService,
    RetentionCron,
    SignalsExportContributor,
    SuggestionsExportContributor,
    ConnectionSettingsExportContributor,
    ActivityLogExportContributor,
  ],
  exports: [SignalEngineFacade],
})
export class SignalEngineModule {}
