import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { TaskPriority, TaskSource } from '../../generated/prisma/enums.js';
import { EDIT_SCOPES, type EditScope } from '../../calendar/dto/update-event.dto.js';
import { IsIanaTimezone } from '../../modules/me/dto/validators.js';
import { IsValidRRule } from '../../calendar/recurrence/rrule.js';

export class UpdateTaskDto {
  @ApiPropertyOptional({ enum: EDIT_SCOPES, default: 'all', description: 'Which occurrences the change applies to.' })
  @IsOptional()
  @IsIn(EDIT_SCOPES)
  scope?: EditScope;

  @ApiPropertyOptional({
    example: '2026-10-02T17:00:00Z',
    description: 'Which occurrence, by its unmodified due date. Required unless `scope` is "all".',
  })
  @IsOptional()
  @IsString()
  occurrenceStart?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) title?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(5000) notes?: string | null;

  @ApiPropertyOptional({ enum: Object.values(TaskPriority) })
  @IsOptional()
  @IsIn(Object.values(TaskPriority))
  priority?: TaskPriority;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() dueAt?: string | null;
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsInt() @Min(1) @Max(100_000) estimatedMinutes?: number;

  @ApiPropertyOptional({ description: 'Only meaningful with scope "all" or "following".' })
  @IsOptional()
  @IsBoolean()
  isCritical?: boolean;

  @ApiPropertyOptional({ description: 'Only meaningful with scope "all" or "following".' })
  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;

  @ApiPropertyOptional({ nullable: true, description: '`null` removes recurrence. Only meaningful with scope "all" or "following".' })
  @IsOptional()
  @IsValidRRule()
  rrule?: string | null;

  @ApiPropertyOptional({ enum: Object.values(TaskSource) })
  @IsOptional()
  @IsIn(Object.values(TaskSource))
  source?: TaskSource;
}
