import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CalendarEventSource, SignalDomain } from '../../generated/prisma/enums.js';

export class CalendarEventResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiPropertyOptional({ nullable: true }) location!: string | null;
  @ApiPropertyOptional({ nullable: true }) color!: string | null;
  @ApiProperty() allDay!: boolean;
  @ApiProperty({ description: 'ISO instant, or "YYYY-MM-DD" (first day, inclusive) when `allDay` is true.' }) startsAt!: string;
  @ApiProperty({ description: 'ISO instant, or "YYYY-MM-DD" (last day, inclusive) when `allDay` is true.' }) endsAt!: string;
  @ApiProperty({ example: 'Africa/Nairobi' }) timezone!: string;
  @ApiPropertyOptional({ nullable: true, example: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10' }) rrule!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'The instant after which the series produces no further occurrences.' })
  seriesUntil!: string | null;
  @ApiProperty({ enum: Object.values(CalendarEventSource) }) source!: CalendarEventSource;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class CalendarEventPageResponse {
  @ApiProperty({ type: [CalendarEventResponse] }) items!: CalendarEventResponse[];
  @ApiProperty({ type: String, nullable: true, description: 'Pass as `cursor` for the next page; null on the last page.' })
  nextCursor!: string | null;
}

export class CalendarOccurrenceResponse {
  @ApiProperty({ format: 'uuid' }) eventId!: string;
  @ApiProperty({ description: 'This occurrence\'s unmodified start. Pass this back as `occurrenceStart` to edit or delete it.' })
  originalStart!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiPropertyOptional({ nullable: true }) location!: string | null;
  @ApiPropertyOptional({ nullable: true }) color!: string | null;
  @ApiProperty() allDay!: boolean;
  @ApiProperty() startsAt!: string;
  @ApiProperty() endsAt!: string;
  @ApiProperty({ description: 'Whether an exception changed this occurrence from the series default.' }) modified!: boolean;
}

export class ContributorStatusResponse {
  @ApiProperty({ enum: Object.values(SignalDomain) }) domain!: SignalDomain;
  @ApiProperty({ enum: ['ok', 'error', 'timeout'] }) status!: 'ok' | 'error' | 'timeout';
}

export class CalendarViewItemResponse {
  @ApiProperty({ enum: ['event', 'block'] }) kind!: 'event' | 'block';
  @ApiPropertyOptional({ format: 'uuid', description: 'Only on `event` items.' }) eventId?: string;
  @ApiPropertyOptional({ description: 'Only on `block` items: the id the contributor gave it.' }) id?: string;
  @ApiPropertyOptional({ enum: Object.values(SignalDomain), description: 'Only on `block` items.' }) domain?: SignalDomain;
  @ApiPropertyOptional({ description: 'Only on `event` items: this occurrence\'s unmodified start.' }) originalStart?: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ nullable: true }) notes?: string | null;
  @ApiPropertyOptional({ nullable: true }) location?: string | null;
  @ApiPropertyOptional({ nullable: true }) color?: string | null;
  @ApiProperty() allDay!: boolean;
  @ApiProperty() startsAt!: string;
  @ApiProperty() endsAt!: string;
  @ApiPropertyOptional({ description: 'Only on `event` items: whether an exception changed it from the series default.' })
  modified?: boolean;
  @ApiPropertyOptional({ description: 'Only on `block` items: whether it occupies time for free/busy purposes.' })
  busy?: boolean;
  @ApiPropertyOptional({ description: 'Only on `block` items: whatever the contributor attached to deep-link into its own domain.' })
  ref?: unknown;
}

export class CalendarViewResponse {
  @ApiProperty({ example: '2026-09-01' }) from!: string;
  @ApiProperty({ example: '2026-09-30' }) to!: string;
  @ApiProperty({ example: 'Africa/Nairobi' }) timezone!: string;
  @ApiProperty({ type: [CalendarViewItemResponse], description: 'Events and soft blocks merged, sorted by start.' })
  items!: CalendarViewItemResponse[];
  @ApiProperty({ type: [ContributorStatusResponse], description: 'One entry per registered soft-block domain.' })
  contributors!: ContributorStatusResponse[];
}

export class FreeSlotResponse {
  @ApiProperty() startsAt!: string;
  @ApiProperty() endsAt!: string;
}
