import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { SignalRegistryService } from '../../src/signal-engine/registry/registry.service.js';
import { CONNECTION_RULE_METADATA } from '../../src/signal-engine/registry/connection-rule.js';
import { ACTION_HANDLER_METADATA } from '../../src/signal-engine/registry/action-handler.js';
import { SIGNAL_DETECTOR_METADATA } from '../../src/signal-engine/registry/signal-detector.js';

function makeProvider(metatype: new () => unknown, instance: unknown) {
  return { metatype, instance };
}

function discoveryReturning(providers: { metatype: new () => unknown; instance: unknown }[]) {
  return { getProviders: vi.fn().mockReturnValue(providers) };
}

describe('SignalRegistryService', () => {
  it('registers a valid rule for a known connection', () => {
    class MyRule {}
    Reflect.defineMetadata(CONNECTION_RULE_METADATA, 'bill-to-reminder', MyRule);
    const registry = new SignalRegistryService(discoveryReturning([makeProvider(MyRule, new MyRule())]) as never);
    registry.onModuleInit();

    expect(registry.getRule('bill-to-reminder')).toBeInstanceOf(MyRule);
    expect(registry.isConnectionAvailable('bill-to-reminder')).toBe(true);
  });

  it('throws when a rule targets a connection outside the catalog', () => {
    class BadRule {}
    Reflect.defineMetadata(CONNECTION_RULE_METADATA, 'not-a-real-connection', BadRule);
    const registry = new SignalRegistryService(discoveryReturning([makeProvider(BadRule, new BadRule())]) as never);

    expect(() => registry.onModuleInit()).toThrow(/does not match any connection/);
  });

  it('throws on duplicate rule registration for the same connection', () => {
    class RuleA {}
    class RuleB {}
    Reflect.defineMetadata(CONNECTION_RULE_METADATA, 'bill-to-reminder', RuleA);
    Reflect.defineMetadata(CONNECTION_RULE_METADATA, 'bill-to-reminder', RuleB);
    const registry = new SignalRegistryService(
      discoveryReturning([makeProvider(RuleA, new RuleA()), makeProvider(RuleB, new RuleB())]) as never,
    );

    expect(() => registry.onModuleInit()).toThrow(/Duplicate @ConnectionRule/);
  });

  it('throws when a handler actionType does not match its decorator argument', () => {
    class MismatchedHandler {
      actionType = 'other';
    }
    Reflect.defineMetadata(ACTION_HANDLER_METADATA, 'expected', MismatchedHandler);
    const registry = new SignalRegistryService(
      discoveryReturning([makeProvider(MismatchedHandler, new MismatchedHandler())]) as never,
    );

    expect(() => registry.onModuleInit()).toThrow(/does not match its actionType property/);
  });

  it('throws on duplicate handler actionType registration', () => {
    class HandlerA {
      actionType = 'dup-action';
    }
    class HandlerB {
      actionType = 'dup-action';
    }
    Reflect.defineMetadata(ACTION_HANDLER_METADATA, 'dup-action', HandlerA);
    Reflect.defineMetadata(ACTION_HANDLER_METADATA, 'dup-action', HandlerB);
    const registry = new SignalRegistryService(
      discoveryReturning([makeProvider(HandlerA, new HandlerA()), makeProvider(HandlerB, new HandlerB())]) as never,
    );

    expect(() => registry.onModuleInit()).toThrow(/Duplicate @ActionHandler/);
  });

  it('throws on duplicate detector name registration', () => {
    class DetA {}
    class DetB {}
    const options = { name: 'dup-detector', cron: '* * * * *' };
    Reflect.defineMetadata(SIGNAL_DETECTOR_METADATA, options, DetA);
    Reflect.defineMetadata(SIGNAL_DETECTOR_METADATA, options, DetB);
    const registry = new SignalRegistryService(
      discoveryReturning([makeProvider(DetA, new DetA()), makeProvider(DetB, new DetB())]) as never,
    );

    expect(() => registry.onModuleInit()).toThrow(/Duplicate @SignalDetector/);
  });

  it('reports connections without a registered rule as unavailable, and unknown handlers as undefined', () => {
    const registry = new SignalRegistryService(discoveryReturning([]) as never);
    registry.onModuleInit();

    expect(registry.isConnectionAvailable('bill-to-reminder')).toBe(false);
    expect(registry.getHandler('anything')).toBeUndefined();
    expect(registry.getDetectors()).toEqual([]);
  });
});
