import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { IsCalendarDate } from '../../common/validators/is-calendar-date.js';

export class ListEntriesQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01', description: 'Inclusive. Defaults to 30 days before `to`.' })
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Inclusive. Defaults to today in the habit\'s own timezone.' })
  @IsOptional()
  @IsCalendarDate()
  to?: string;
}
