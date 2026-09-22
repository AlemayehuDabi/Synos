import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { IsCalendarDate } from '../../common/validators/is-calendar-date.js';
import { IsIanaTimezone } from '../../modules/me/dto/validators.js';

export class CalendarViewQueryDto {
  @ApiProperty({ example: '2026-09-01' })
  @IsCalendarDate()
  from!: string;

  @ApiProperty({ example: '2026-09-30' })
  @IsCalendarDate()
  to!: string;

  @ApiPropertyOptional({ example: 'Africa/Nairobi', description: 'Defaults to the caller\'s own timezone.' })
  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;
}
