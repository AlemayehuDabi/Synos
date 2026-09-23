import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { TaskPriority, TaskStatus } from '../../generated/prisma/enums.js';

export class ListTasksQueryDto {
  @ApiPropertyOptional({ enum: Object.values(TaskStatus) }) @IsOptional() @IsIn(Object.values(TaskStatus)) status?: TaskStatus;
  @ApiPropertyOptional({ enum: Object.values(TaskPriority) }) @IsOptional() @IsIn(Object.values(TaskPriority)) priority?: TaskPriority;

  @ApiPropertyOptional({ description: 'Only tasks due at or before this instant.' }) @IsOptional() @IsString() dueBefore?: string;
  @ApiPropertyOptional({ description: 'Only tasks due at or after this instant.' }) @IsOptional() @IsString() dueAfter?: string;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4') recurringGroupId?: string;

  @ApiPropertyOptional({ description: 'Only tasks with no scheduledStart.' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  unscheduled?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
