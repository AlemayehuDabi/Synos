import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { IsCalendarDate } from '../../common/validators/is-calendar-date.js';

export class TodayQueryDto {
  @ApiPropertyOptional({
    example: '2026-09-21',
    description: 'The day to show, as a real calendar date (YYYY-MM-DD). Defaults to today in the user\'s timezone.',
  })
  @IsOptional()
  @IsCalendarDate()
  date?: string;
}
