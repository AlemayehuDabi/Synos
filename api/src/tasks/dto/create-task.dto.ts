import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { TaskPriority, TaskSource } from '../../generated/prisma/enums.js';
import { IsIanaTimezone } from '../../modules/me/dto/validators.js';
import { IsValidRRule } from '../../calendar/recurrence/rrule.js';

export class CreateTaskDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Client-supplied id. Creating an id that already exists is a 409.' })
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @ApiProperty({ example: 'Water the plants', description: 'The only field a quick capture needs; everything else is optional/defaulted.' })
  @IsString()
  @Length(1, 200)
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) notes?: string;

  @ApiPropertyOptional({ enum: Object.values(TaskPriority), default: 'none' })
  @IsOptional()
  @IsIn(Object.values(TaskPriority))
  priority?: TaskPriority;

  @ApiPropertyOptional({ example: '2026-09-25T17:00:00Z', description: 'Required if `rrule` is set.' })
  @IsOptional()
  @IsString()
  dueAt?: string;

  @ApiPropertyOptional({ example: '2026-09-25T09:00:00Z' }) @IsOptional() @IsString() scheduledStart?: string;
  @ApiPropertyOptional({ example: '2026-09-25T09:30:00Z' }) @IsOptional() @IsString() scheduledEnd?: string;

  @ApiPropertyOptional({ example: 'Africa/Nairobi', description: 'Defaults to the caller\'s own timezone. Recurrence is expanded in this zone.' })
  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;

  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsInt() @Min(1) @Max(100_000) estimatedMinutes?: number;

  @ApiPropertyOptional({ default: false, description: 'Recovery suggestions never adjust a critical task\'s schedule or estimate.' })
  @IsOptional()
  @IsBoolean()
  isCritical?: boolean;

  @ApiPropertyOptional({
    example: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    description: 'An RRULE value, same subset Calendar accepts. Requires `dueAt`.',
  })
  @IsOptional()
  @IsValidRRule()
  rrule?: string;

  @ApiPropertyOptional({ enum: Object.values(TaskSource), default: 'manual' })
  @IsOptional()
  @IsIn(Object.values(TaskSource))
  source?: TaskSource;
}
