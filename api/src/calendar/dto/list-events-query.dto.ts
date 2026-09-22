import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { IsCalendarDate } from '../../common/validators/is-calendar-date.js';

export class ListCalendarEventsQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01', description: 'Only events overlapping on or after this date.' })
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Only events overlapping on or before this date.' })
  @IsOptional()
  @IsCalendarDate()
  to?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
