import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { HabitEntryStatus } from '../../generated/prisma/enums.js';
import { IsCalendarDate } from '../../common/validators/is-calendar-date.js';

export class UpsertEntryDto {
  @ApiPropertyOptional({ example: '2026-09-25', description: 'Defaults to today, in the habit\'s own timezone. One entry per date: posting the same date again updates it.' })
  @IsOptional()
  @IsCalendarDate()
  date?: string;

  @ApiPropertyOptional({ enum: Object.values(HabitEntryStatus), default: 'done' })
  @IsOptional()
  @IsIn(Object.values(HabitEntryStatus))
  status?: HabitEntryStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
