import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { CalendarEventSource } from '../../generated/prisma/enums.js';
import { IsIanaTimezone } from '../../modules/me/dto/validators.js';
import { IsValidRRule } from '../recurrence/rrule.js';

const COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export class CreateCalendarEventDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Client-supplied id. Creating an id that already exists is a 409.' })
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @ApiProperty({ example: 'Team standup' })
  @IsString()
  @Length(1, 200)
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) location?: string;

  @ApiPropertyOptional({ example: '#4287f5', description: 'A 3- or 6-digit hex color.' })
  @IsOptional()
  @Matches(COLOR_PATTERN, { message: 'color must be a hex color like #4287f5' })
  color?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @ApiProperty({
    example: '2026-09-22T09:00:00Z',
    description: 'An ISO-8601 instant for a timed event, or "YYYY-MM-DD" (the first day, inclusive) when `allDay` is true.',
  })
  @IsString()
  startsAt!: string;

  @ApiProperty({
    example: '2026-09-22T10:00:00Z',
    description: 'An ISO-8601 instant for a timed event, or "YYYY-MM-DD" (the last day, inclusive) when `allDay` is true.',
  })
  @IsString()
  endsAt!: string;

  @ApiPropertyOptional({
    example: 'Africa/Nairobi',
    description: 'Defaults to the caller\'s own timezone. Recurrence is expanded in this zone; ignored for `allDay` events, which are calendar-date arithmetic and never shift with DST.',
  })
  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;

  @ApiPropertyOptional({
    example: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10',
    description:
      'An RRULE value (FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, BYDAY, BYMONTHDAY, BYMONTH, BYSETPOS, WKST, and COUNT or UNTIL). ' +
      'UNTIL is a normal ISO-8601 date or instant, not the RFC 5545 wire token.',
  })
  @IsOptional()
  @IsValidRRule()
  rrule?: string;

  @ApiPropertyOptional({ enum: Object.values(CalendarEventSource), default: 'manual' })
  @IsOptional()
  @IsIn(Object.values(CalendarEventSource))
  source?: CalendarEventSource;
}
