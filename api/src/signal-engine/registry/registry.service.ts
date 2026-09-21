import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { allConnectionIds, isKnownConnectionId } from '../catalog/connections.js';
import { ACTION_HANDLER_METADATA, type ActionHandler } from './action-handler.js';
import { CONNECTION_RULE_METADATA, type ConnectionRule } from './connection-rule.js';
import { SIGNAL_DETECTOR_METADATA, type SignalDetector, type SignalDetectorOptions } from './signal-detector.js';

export interface RegisteredDetector {
  options: SignalDetectorOptions;
  instance: SignalDetector;
}

/**
 * Discovers every @ConnectionRule/@ActionHandler/@SignalDetector provider in
 * the whole application (not just this module's own providers - DiscoveryService
 * scans the entire DI graph) and validates the result at boot. This is the only
 * place domain modules need to "plug into": declare a decorated provider
 * anywhere reachable from AppModule and it shows up here automatically.
 */
@Injectable()
export class SignalRegistryService implements OnModuleInit {
  private readonly logger = new Logger(SignalRegistryService.name);
  private readonly rules = new Map<string, ConnectionRule>();
  private readonly handlers = new Map<string, ActionHandler>();
  private readonly detectors: RegisteredDetector[] = [];

  constructor(private readonly discoveryService: DiscoveryService) {}

  onModuleInit(): void {
    for (const wrapper of this.discoveryService.getProviders()) {
      const metatype = wrapper.metatype;
      const instance = wrapper.instance;
      if (!metatype || !instance) continue;

      const connectionId = Reflect.getMetadata(CONNECTION_RULE_METADATA, metatype) as string | undefined;
      if (connectionId !== undefined) {
        this.registerRule(connectionId, instance as ConnectionRule, metatype.name);
      }

      const actionType = Reflect.getMetadata(ACTION_HANDLER_METADATA, metatype) as string | undefined;
      if (actionType !== undefined) {
        this.registerHandler(actionType, instance as ActionHandler, metatype.name);
      }

      const detectorOptions = Reflect.getMetadata(SIGNAL_DETECTOR_METADATA, metatype) as
        | SignalDetectorOptions
        | undefined;
      if (detectorOptions !== undefined) {
        this.registerDetector(detectorOptions, instance as SignalDetector, metatype.name);
      }
    }

    this.warnAboutUnavailableConnections();
    this.logger.log(
      `Registered ${this.rules.size} rule(s), ${this.handlers.size} handler(s), ${this.detectors.length} detector(s)`,
    );
  }

  private registerRule(connectionId: string, instance: ConnectionRule, className: string): void {
    if (!isKnownConnectionId(connectionId)) {
      throw new Error(
        `@ConnectionRule("${connectionId}") on ${className} does not match any connection in the catalog`,
      );
    }
    if (this.rules.has(connectionId)) {
      throw new Error(`Duplicate @ConnectionRule("${connectionId}") registration (found on ${className})`);
    }
    this.rules.set(connectionId, instance);
  }

  private registerHandler(actionType: string, instance: ActionHandler, className: string): void {
    if (instance.actionType !== actionType) {
      throw new Error(
        `@ActionHandler("${actionType}") on ${className} does not match its actionType property ("${instance.actionType}")`,
      );
    }
    if (this.handlers.has(actionType)) {
      throw new Error(`Duplicate @ActionHandler("${actionType}") registration (found on ${className})`);
    }
    this.handlers.set(actionType, instance);
  }

  private registerDetector(options: SignalDetectorOptions, instance: SignalDetector, className: string): void {
    if (this.detectors.some((detector) => detector.options.name === options.name)) {
      throw new Error(`Duplicate @SignalDetector("${options.name}") registration (found on ${className})`);
    }
    this.detectors.push({ options, instance });
  }

  private warnAboutUnavailableConnections(): void {
    for (const id of allConnectionIds()) {
      if (!this.rules.has(id)) {
        this.logger.warn(`Connection "${id}" has no registered rule yet; it will report available: false`);
      }
    }
  }

  getRule(connectionId: string): ConnectionRule | undefined {
    return this.rules.get(connectionId);
  }

  getHandler(actionType: string): ActionHandler | undefined {
    return this.handlers.get(actionType);
  }

  getDetectors(): RegisteredDetector[] {
    return this.detectors;
  }

  isConnectionAvailable(connectionId: string): boolean {
    return this.rules.has(connectionId);
  }
}
