import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { discoverByMetadata } from '../common/discovery/discover-by-metadata.js';
import { SignalDomain } from '../generated/prisma/enums.js';
import { REVIEW_CONTRIBUTOR_METADATA, type ReviewContributor } from './review-contributor.js';

const DOMAIN_ORDER: SignalDomain[] = Object.values(SignalDomain);

@Injectable()
export class ReviewRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ReviewRegistryService.name);
  private readonly contributors = new Map<SignalDomain, ReviewContributor>();

  constructor(private readonly discoveryService: DiscoveryService) {}

  onModuleInit(): void {
    for (const { metadata: domain, instance, className } of discoverByMetadata<string>(
      this.discoveryService,
      REVIEW_CONTRIBUTOR_METADATA,
    )) {
      if (!DOMAIN_ORDER.includes(domain as SignalDomain)) {
        throw new Error(`@ReviewContributor("${domain}") on ${className} is not a known domain`);
      }
      if (typeof (instance as Partial<ReviewContributor>).collect !== 'function') {
        throw new Error(`${className} is decorated with @ReviewContributor but has no collect() method`);
      }
      if (this.contributors.has(domain as SignalDomain)) {
        throw new Error(`Duplicate @ReviewContributor("${domain}") registration (found on ${className})`);
      }
      this.contributors.set(domain as SignalDomain, instance as ReviewContributor);
    }
    this.logger.log(`Registered ${this.contributors.size} review contributor(s)`);
  }

  list(): { domain: SignalDomain; contributor: ReviewContributor }[] {
    return DOMAIN_ORDER.filter((domain) => this.contributors.has(domain)).map((domain) => ({
      domain,
      contributor: this.contributors.get(domain)!,
    }));
  }
}
