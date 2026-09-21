import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActivityKind, ConnectionMode, ResolvedBy, SignalDomain, SuggestionStatus } from '../../generated/prisma/enums.js';

const DOMAINS = Object.values(SignalDomain);

/** The standard error shape produced by the global exception filter. */
export class ErrorResponse {
  @ApiProperty({ example: 409 })
  statusCode!: number;

  @ApiProperty({ example: 'CONFLICT' })
  error!: string;

  @ApiProperty({ example: 'Suggestion is no longer pending' })
  message!: string;

  @ApiPropertyOptional({ description: 'Validation issues, present on 400/422 responses.', type: [Object] })
  details?: unknown[];
}

export class SignalResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ example: 'bill.due' }) type!: string;
  @ApiProperty({ enum: DOMAINS }) sourceDomain!: SignalDomain;
  @ApiProperty() schemaVersion!: number;
  @ApiProperty({ type: Object, description: 'Validated against the signal catalog; shape depends on `type`.' })
  payload!: unknown;
  @ApiPropertyOptional({ type: String, nullable: true }) subjectType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) subjectId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) dedupeKey!: string | null;
  @ApiProperty() occurredAt!: Date;
  @ApiPropertyOptional({ type: Date, nullable: true }) processedAt!: Date | null;
  @ApiProperty() attempts!: number;
  @ApiPropertyOptional({ type: Date, nullable: true }) nextAttemptAt!: Date | null;
  @ApiPropertyOptional({ type: String, nullable: true }) lastError!: string | null;
  @ApiProperty() createdAt!: Date;
}

export class SignalPageResponse {
  @ApiProperty({ type: [SignalResponse] }) items!: SignalResponse[];
  @ApiProperty({ type: String, nullable: true, description: 'Pass as `cursor` to fetch the next page; null on the last page.' })
  nextCursor!: string | null;
}

export class SuggestionResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) signalId!: string | null;
  @ApiProperty({ example: 'bill-to-reminder' }) connectionId!: string;
  @ApiProperty({ enum: DOMAINS }) targetDomain!: SignalDomain;
  @ApiProperty({ example: 'tasks.create-reminder' }) actionType!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ type: Object, description: 'Validated against the action handler\'s params schema.' }) params!: unknown;
  @ApiPropertyOptional({ type: Object, nullable: true, description: 'The params as first proposed; set on the first edit.' })
  originalParams!: unknown;
  @ApiProperty({ example: 'habit:abc:2026-09-21', description: 'What is being changed; manual overrides supersede against this.' })
  targetKey!: string;
  @ApiProperty() dedupeKey!: string;
  @ApiProperty({ enum: Object.values(SuggestionStatus) }) status!: SuggestionStatus;
  @ApiPropertyOptional({ type: String, nullable: true }) failureNote!: string | null;
  @ApiProperty() expiresAt!: Date;
  @ApiPropertyOptional({ type: Date, nullable: true }) resolvedAt!: Date | null;
  @ApiPropertyOptional({ enum: Object.values(ResolvedBy), nullable: true }) resolvedBy!: ResolvedBy | null;
  @ApiPropertyOptional({ type: String, nullable: true }) supersededReason!: string | null;
  @ApiPropertyOptional({ type: Object, nullable: true }) revertData!: unknown;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class SuggestionPageResponse {
  @ApiProperty({ type: [SuggestionResponse] }) items!: SuggestionResponse[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class ActivityResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ enum: Object.values(ActivityKind) }) kind!: ActivityKind;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) suggestionId!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) signalId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) connectionId!: string | null;
  @ApiPropertyOptional({ enum: DOMAINS, nullable: true }) targetDomain!: SignalDomain | null;
  @ApiPropertyOptional({ type: Object, nullable: true }) entityRef!: unknown;
  @ApiPropertyOptional({ type: Object, nullable: true }) before!: unknown;
  @ApiPropertyOptional({ type: Object, nullable: true }) after!: unknown;
  @ApiPropertyOptional({ type: Date, nullable: true, description: 'Set once this action has been undone.' }) undoneAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}

export class ActivityPageResponse {
  @ApiProperty({ type: [ActivityResponse] }) items!: ActivityResponse[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class InboxTriggerResponse {
  @ApiProperty({ format: 'uuid' }) signalId!: string;
  @ApiProperty({ example: 'bill.due' }) type!: string;
  @ApiProperty() occurredAt!: Date;
  @ApiProperty({ type: Object }) payload!: unknown;
}

export class InboxItemResponse extends SuggestionResponse {
  @ApiPropertyOptional({ type: InboxTriggerResponse, nullable: true, description: 'The signal that produced this suggestion, if it still exists.' })
  trigger!: InboxTriggerResponse | null;

  @ApiProperty({ type: [ActivityResponse], description: 'This suggestion\'s activity log entries, oldest first.' })
  statusHistory!: ActivityResponse[];
}

export class PendingCountResponse {
  @ApiProperty({ example: 3 }) pending!: number;
}

export class BulkResultResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['ok', 'error'] }) status!: 'ok' | 'error';
  @ApiPropertyOptional({ description: 'Why this id failed; other ids in the same call are unaffected.' }) error?: string;
}

export class ConnectionResponse {
  @ApiProperty({ example: 'bill-to-reminder' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: DOMAINS }) sourceDomain!: SignalDomain;
  @ApiProperty({ type: [String], example: ['bill.due'] }) sourceSignals!: string[];
  @ApiProperty({ enum: DOMAINS }) targetDomain!: SignalDomain;
  @ApiProperty({ enum: Object.values(ConnectionMode) }) defaultMode!: ConnectionMode;
  @ApiProperty({ enum: Object.values(ConnectionMode), description: 'The highest mode this connection may be set to.' })
  maxMode!: ConnectionMode;
  @ApiProperty({ enum: Object.values(ConnectionMode), description: 'The user\'s stored mode, or the default.' })
  mode!: ConnectionMode;
  @ApiProperty({ description: 'False until a domain module registers a rule for this connection.' }) available!: boolean;
  @ApiPropertyOptional({ type: Date, nullable: true }) updatedAt!: Date | null;
}
