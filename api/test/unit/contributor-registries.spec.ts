import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { REVIEW_CONTRIBUTOR_METADATA } from '../../src/reviews/review-contributor.js';
import { ReviewRegistryService } from '../../src/reviews/review-registry.service.js';
import { TODAY_CONTRIBUTOR_METADATA } from '../../src/today/today-contributor.js';
import { TodayRegistryService } from '../../src/today/today-registry.service.js';

function provider(metadataKey: string, domain: string, instance: object) {
  class Contributor {}
  Object.defineProperty(Contributor, 'name', { value: `${domain}Contributor` });
  Reflect.defineMetadata(metadataKey, domain, Contributor);
  return { metatype: Contributor, instance };
}

const discoveryOf = (providers: unknown[]) => ({ getProviders: vi.fn().mockReturnValue(providers) }) as never;
const withCollect = () => ({ collect: vi.fn() });

describe.each([
  ['TodayRegistryService', TodayRegistryService, TODAY_CONTRIBUTOR_METADATA, '@TodayContributor'],
  ['ReviewRegistryService', ReviewRegistryService, REVIEW_CONTRIBUTOR_METADATA, '@ReviewContributor'],
] as const)('%s', (_name, Registry, key, decorator) => {
  it('registers a contributor per known domain', () => {
    const tasks = withCollect();
    const registry = new Registry(discoveryOf([provider(key, 'tasks', tasks)]));
    registry.onModuleInit();
    expect(registry.list()).toEqual([{ domain: 'tasks', contributor: tasks }]);
  });

  it('lists in a fixed domain order whatever order they were discovered in', () => {
    const registry = new Registry(
      discoveryOf([
        provider(key, 'meals', withCollect()),
        provider(key, 'calendar', withCollect()),
        provider(key, 'finances', withCollect()),
        provider(key, 'tasks', withCollect()),
      ]),
    );
    registry.onModuleInit();
    expect(registry.list().map((entry) => entry.domain)).toEqual(['calendar', 'tasks', 'finances', 'meals']);
  });

  it('is empty when nothing is registered', () => {
    const registry = new Registry(discoveryOf([{ metatype: class Unrelated {}, instance: {} }]));
    registry.onModuleInit();
    expect(registry.list()).toEqual([]);
  });

  it('refuses a domain that does not exist', () => {
    const registry = new Registry(discoveryOf([provider(key, 'gardening', withCollect())]));
    expect(() => registry.onModuleInit()).toThrow(`${decorator}("gardening")`);
  });

  it('refuses a provider without a collect() method', () => {
    const registry = new Registry(discoveryOf([provider(key, 'tasks', {})]));
    expect(() => registry.onModuleInit()).toThrow('no collect() method');
  });

  it('refuses two contributors for the same domain', () => {
    const registry = new Registry(discoveryOf([provider(key, 'tasks', withCollect()), provider(key, 'tasks', withCollect())]));
    expect(() => registry.onModuleInit()).toThrow('Duplicate');
  });
});
