import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { HabitEntryStatus } from '../../generated/prisma/enums.js';

export class UpdateEntryDto {
  @ApiPropertyOptional({ enum: Object.values(HabitEntryStatus) })
  @IsOptional()
  @IsIn(Object.values(HabitEntryStatus))
  status?: HabitEntryStatus;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
}
