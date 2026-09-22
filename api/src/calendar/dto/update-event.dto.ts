import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { CalendarEventSource } from '../../generated/prisma/enums.js';
import { IsIanaTimezone } from '../../modules/me/dto/validators.js';
import { IsValidRRule } from '../recurrence/rrule.js';

const COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export type EditScope = 'this' | 'following' | 'all';
export const EDIT_SCOPES: EditScope[] = ['this', 'following', 'all'];

export class UpdateCalendarEventDto {
  @ApiPropertyOptional({ enum: EDIT_SCOPES, default: 'all', description: 'Which occurrences the change applies to.' })
  @IsOptional()
  @IsIn(EDIT_SCOPES)
  scope?: EditScope;

  @ApiPropertyOptional({
    example: '2026-09-29T09:00:00Z',
    description: 'Which occurrence, by its unmodified (natural) start. Required unless `scope` is "all".',
  })
  @IsOptional()
  @IsString()
  occurrenceStart?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) title?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(5000) notes?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(500) location?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Matches(COLOR_PATTERN, { message: 'color must be a hex color like #4287f5' })
  color?: string | null;

  @ApiPropertyOptional({ description: 'Only meaningful with `scope` "all" or "following".' })
  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @ApiPropertyOptional({ description: 'See POST /calendar/events. With `scope` "this", both startsAt and endsAt must be given together.' })
  @IsOptional()
  @IsString()
  startsAt?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() endsAt?: string;

  @ApiPropertyOptional({ description: 'Only meaningful with `scope` "all" or "following".' })
  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: '`null` removes recurrence. Only meaningful with `scope` "all" or "following".',
  })
  @IsOptional()
  @IsValidRRule()
  rrule?: string | null;

  @ApiPropertyOptional({ enum: Object.values(CalendarEventSource) })
  @IsOptional()
  @IsIn(Object.values(CalendarEventSource))
  source?: CalendarEventSource;
}
