import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { IsCalendarDate } from '../../common/validators/is-calendar-date.js';
import { IsIanaTimezone } from '../../modules/me/dto/validators.js';
import { TIME_OF_DAY_PATTERN } from '../../notifications/quiet-hours.js';

export class CalendarFreeSlotsQueryDto {
  @ApiProperty({ example: '2026-09-01' })
  @IsCalendarDate()
  from!: string;

  @ApiProperty({ example: '2026-09-07' })
  @IsCalendarDate()
  to!: string;

  @ApiProperty({ example: 30, description: 'Minimum free window length, in minutes.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_080)
  duration!: number;

  @ApiPropertyOptional({ example: '09:00', description: 'Start of the working day, "HH:mm" in the caller\'s timezone. Requires `dayEnd`.' })
  @IsOptional()
  @Matches(TIME_OF_DAY_PATTERN, { message: 'dayStart must be a 24-hour "HH:mm" time' })
  dayStart?: string;

  @ApiPropertyOptional({ example: '18:00', description: 'End of the working day, "HH:mm" in the caller\'s timezone. Requires `dayStart`.' })
  @IsOptional()
  @Matches(TIME_OF_DAY_PATTERN, { message: 'dayEnd must be a 24-hour "HH:mm" time' })
  dayEnd?: string;

  @ApiPropertyOptional({ example: 'Africa/Nairobi', description: 'Defaults to the caller\'s own timezone.' })
  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
