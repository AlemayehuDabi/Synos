import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { HabitSchedule, HabitSource, HabitType } from '../../generated/prisma/enums.js';
import { IsIanaTimezone } from '../../modules/me/dto/validators.js';

export class CreateHabitDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Client-supplied id. Creating an id that already exists is a 409.' })
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @ApiProperty({ example: 'Read before bed' })
  @IsString()
  @Length(1, 200)
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) notes?: string;

  @ApiProperty({ enum: Object.values(HabitType) })
  @IsIn(Object.values(HabitType))
  type!: HabitType;

  @ApiProperty({ enum: Object.values(HabitSchedule) })
  @IsIn(Object.values(HabitSchedule))
  schedule!: HabitSchedule;

  @ApiPropertyOptional({ type: [Number], description: 'Required for schedule "specificDays": 0 (Sunday) - 6 (Saturday).' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  scheduleDays?: number[];

  @ApiPropertyOptional({ minimum: 1, description: 'Required for schedule "timesPerWeek"/"timesPerMonth": check-ins needed per period.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  targetPerPeriod?: number;

  @ApiPropertyOptional({ example: 'Africa/Nairobi', description: 'Defaults to the caller\'s own timezone. The schedule is evaluated in this zone.' })
  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;

  @ApiPropertyOptional({ example: '#4287f5' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @ApiPropertyOptional({ enum: Object.values(HabitSource), default: 'manual' })
  @IsOptional()
  @IsIn(Object.values(HabitSource))
  source?: HabitSource;
}
