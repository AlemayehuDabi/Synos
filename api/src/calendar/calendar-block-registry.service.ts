import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { discoverByMetadata } from '../common/discovery/discover-by-metadata.js';
import { SignalDomain } from '../generated/prisma/enums.js';
import { CALENDAR_BLOCK_CONTRIBUTOR_METADATA, type CalendarBlockContributor } from './calendar-block-contributor.js';

const DOMAIN_ORDER: SignalDomain[] = Object.values(SignalDomain);

@Injectable()
export class CalendarBlockRegistryService implements OnModuleInit {
  private readonly logger = new Logger(CalendarBlockRegistryService.name);
  private readonly contributors = new Map<SignalDomain, CalendarBlockContributor>();

  constructor(private readonly discoveryService: DiscoveryService) {}

  onModuleInit(): void {
    for (const { metadata: domain, instance, className } of discoverByMetadata<string>(
      this.discoveryService,
      CALENDAR_BLOCK_CONTRIBUTOR_METADATA,
    )) {
      if (!DOMAIN_ORDER.includes(domain as SignalDomain)) {
        throw new Error(`@CalendarBlockContributor("${domain}") on ${className} is not a known domain`);
      }
      if (typeof (instance as Partial<CalendarBlockContributor>).collect !== 'function') {
        throw new Error(`${className} is decorated with @CalendarBlockContributor but has no collect() method`);
      }
      if (this.contributors.has(domain as SignalDomain)) {
        throw new Error(`Duplicate @CalendarBlockContributor("${domain}") registration (found on ${className})`);
      }
      this.contributors.set(domain as SignalDomain, instance as CalendarBlockContributor);
    }
    this.logger.log(`Registered ${this.contributors.size} calendar block contributor(s)`);
  }

  /** Registered contributors, always in the same (canonical domain) order. */
  list(): { domain: SignalDomain; contributor: CalendarBlockContributor }[] {
    return DOMAIN_ORDER.filter((domain) => this.contributors.has(domain)).map((domain) => ({
      domain,
      contributor: this.contributors.get(domain)!,
    }));
  }
}
