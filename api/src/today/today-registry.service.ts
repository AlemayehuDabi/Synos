import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { discoverByMetadata } from '../common/discovery/discover-by-metadata.js';
import { SignalDomain } from '../generated/prisma/enums.js';
import { TODAY_CONTRIBUTOR_METADATA, type TodayContributor } from './today-contributor.js';

const DOMAIN_ORDER: SignalDomain[] = Object.values(SignalDomain);

@Injectable()
export class TodayRegistryService implements OnModuleInit {
  private readonly logger = new Logger(TodayRegistryService.name);
  private readonly contributors = new Map<SignalDomain, TodayContributor>();

  constructor(private readonly discoveryService: DiscoveryService) {}

  onModuleInit(): void {
    for (const { metadata: domain, instance, className } of discoverByMetadata<string>(
      this.discoveryService,
      TODAY_CONTRIBUTOR_METADATA,
    )) {
      if (!DOMAIN_ORDER.includes(domain as SignalDomain)) {
        throw new Error(`@TodayContributor("${domain}") on ${className} is not a known domain`);
      }
      if (typeof (instance as Partial<TodayContributor>).collect !== 'function') {
        throw new Error(`${className} is decorated with @TodayContributor but has no collect() method`);
      }
      if (this.contributors.has(domain as SignalDomain)) {
        throw new Error(`Duplicate @TodayContributor("${domain}") registration (found on ${className})`);
      }
      this.contributors.set(domain as SignalDomain, instance as TodayContributor);
    }
    this.logger.log(`Registered ${this.contributors.size} Today contributor(s)`);
  }

  /** Registered contributors, always in the same (canonical domain) order. */
  list(): { domain: SignalDomain; contributor: TodayContributor }[] {
    return DOMAIN_ORDER.filter((domain) => this.contributors.has(domain)).map((domain) => ({
      domain,
      contributor: this.contributors.get(domain)!,
    }));
  }
}
