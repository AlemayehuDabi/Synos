import { SetMetadata } from '@nestjs/common';

export const EXPORT_CONTRIBUTOR_METADATA = 'export_contributor';

/**
 * Marks a provider as a data-export contributor. DataExportModule discovers every
 * provider carrying this metadata at boot (via DiscoveryService) and calls its
 * `collect(userId)` method when building an export - new domain modules add a
 * provider with this decorator and never need to touch DataExportModule.
 */
export const AsExportContributor = (): ClassDecorator => SetMetadata(EXPORT_CONTRIBUTOR_METADATA, true);
