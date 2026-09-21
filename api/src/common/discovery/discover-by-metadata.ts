import type { DiscoveryService } from '@nestjs/core';

export interface DiscoveredProvider<M> {
  metadata: M;
  instance: unknown;
  className: string;
}

/**
 * Finds every provider in the whole application (not just one module's own) whose
 * class carries `metadataKey`. This is how domain modules plug into the engines:
 * declare a decorated provider anywhere reachable from AppModule.
 */
export function discoverByMetadata<M>(discovery: DiscoveryService, metadataKey: string): DiscoveredProvider<M>[] {
  const found: DiscoveredProvider<M>[] = [];
  for (const wrapper of discovery.getProviders()) {
    const { metatype, instance } = wrapper;
    if (!metatype || !instance) continue;
    const metadata = Reflect.getMetadata(metadataKey, metatype) as M | undefined;
    if (metadata !== undefined) {
      found.push({ metadata, instance, className: metatype.name });
    }
  }
  return found;
}
