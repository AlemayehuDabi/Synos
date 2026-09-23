import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { HabitSchedule, HabitSource, HabitType } from '../../generated/prisma/enums.js';
import { IsIanaTimezone } from '../../modules/me/dto/validators.js';

export class UpdateHabitDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) title?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(5000) notes?: string | null;

  @ApiPropertyOptional({ enum: Object.values(HabitType) })
  @IsOptional()
  @IsIn(Object.values(HabitType))
  type?: HabitType;

  @ApiPropertyOptional({ enum: Object.values(HabitSchedule) })
  @IsOptional()
  @IsIn(Object.values(HabitSchedule))
  schedule?: HabitSchedule;

  @ApiPropertyOptional({ type: [Number], description: 'Required when schedule is "specificDays": 0 (Sunday) - 6 (Saturday).' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  scheduleDays?: number[];

  @ApiPropertyOptional({ minimum: 1, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  targetPerPeriod?: number | null;

  @ApiPropertyOptional({ example: 'Africa/Nairobi' })
  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;

  @ApiPropertyOptional({ nullable: true, example: '#4287f5' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string | null;

  @ApiPropertyOptional({ enum: Object.values(HabitSource) })
  @IsOptional()
  @IsIn(Object.values(HabitSource))
  source?: HabitSource;
}
