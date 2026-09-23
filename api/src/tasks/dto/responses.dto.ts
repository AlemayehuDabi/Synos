import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority, TaskSource, TaskStatus } from '../../generated/prisma/enums.js';

export class TaskResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiProperty({ enum: Object.values(TaskStatus) }) status!: TaskStatus;
  @ApiProperty({ enum: Object.values(TaskPriority) }) priority!: TaskPriority;
  @ApiPropertyOptional({ nullable: true, description: 'ISO instant.' }) dueAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) scheduledStart!: string | null;
  @ApiPropertyOptional({ nullable: true }) scheduledEnd!: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'Africa/Nairobi' }) timezone!: string | null;
  @ApiPropertyOptional({ nullable: true }) estimatedMinutes!: number | null;
  @ApiPropertyOptional({ nullable: true }) actualMinutes!: number | null;
  @ApiProperty({ description: 'Recovery suggestions never adjust a critical task.' }) isCritical!: boolean;
  @ApiPropertyOptional({ nullable: true, example: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' }) rrule!: string | null;
  @ApiPropertyOptional({ nullable: true }) seriesUntil!: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uuid', description: 'Stable across a scope="following" split; null for a non-recurring task.' })
  recurringGroupId!: string | null;
  @ApiProperty({ enum: Object.values(TaskSource) }) source!: TaskSource;
  @ApiProperty() sortOrder!: number;
  @ApiPropertyOptional({ nullable: true }) completedAt!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class TaskPageResponse {
  @ApiProperty({ type: [TaskResponse] }) items!: TaskResponse[];
  @ApiProperty({ type: String, nullable: true, description: 'Pass as `cursor` for the next page; null on the last page.' })
  nextCursor!: string | null;
}

export class TaskOccurrenceResponse {
  @ApiProperty({ format: 'uuid' }) taskId!: string;
  @ApiProperty({ description: 'This occurrence\'s unmodified due date. Pass this back as `occurrenceStart` to edit, skip or delete it.' })
  originalDueAt!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiProperty({ enum: Object.values(TaskPriority) }) priority!: TaskPriority;
  @ApiProperty() dueAt!: string;
  @ApiPropertyOptional({ nullable: true }) scheduledStart!: string | null;
  @ApiPropertyOptional({ nullable: true }) scheduledEnd!: string | null;
  @ApiPropertyOptional({ nullable: true }) estimatedMinutes!: number | null;
  @ApiProperty({ description: 'Whether an exception changed this occurrence from the series default.' }) modified!: boolean;
}

export class SubtaskResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) taskId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ['open', 'completed'] }) status!: 'open' | 'completed';
  @ApiProperty() sortOrder!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
