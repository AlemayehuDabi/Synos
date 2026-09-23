import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HabitEntryStatus, HabitSchedule, HabitSource, HabitType } from '../../generated/prisma/enums.js';

export class HabitResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiProperty({ enum: Object.values(HabitType) }) type!: HabitType;
  @ApiProperty({ enum: Object.values(HabitSchedule) }) schedule!: HabitSchedule;
  @ApiProperty({ type: [Number] }) scheduleDays!: number[];
  @ApiPropertyOptional({ nullable: true }) targetPerPeriod!: number | null;
  @ApiProperty({ example: 'Africa/Nairobi' }) timezone!: string;
  @ApiPropertyOptional({ nullable: true }) color!: string | null;
  @ApiProperty() isArchived!: boolean;
  @ApiPropertyOptional({ nullable: true }) archivedAt!: string | null;
  @ApiProperty({ enum: Object.values(HabitSource) }) source!: HabitSource;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class HabitPageResponse {
  @ApiProperty({ type: [HabitResponse] }) items!: HabitResponse[];
  @ApiProperty({ type: String, nullable: true, description: 'Pass as `cursor` for the next page; null on the last page.' })
  nextCursor!: string | null;
}

export class HabitEntryResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) habitId!: string;
  @ApiProperty({ example: '2026-09-25' }) date!: string;
  @ApiProperty({ enum: Object.values(HabitEntryStatus) }) status!: HabitEntryStatus;
  @ApiPropertyOptional({ nullable: true }) note!: string | null;
  @ApiProperty({ enum: Object.values(HabitSource) }) source!: HabitSource;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class HabitStatsResponse {
  @ApiProperty({ format: 'uuid' }) habitId!: string;
  @ApiProperty({ description: 'Consecutive successful scheduled units (days, or periods for weekly/timesPerWeek/timesPerMonth) up to now.' })
  current!: number;
  @ApiProperty({ description: 'The longest streak this habit has ever had.' }) best!: number;
  @ApiPropertyOptional({ nullable: true, description: 'The most recent date a grace pass was used to protect the current streak.' })
  graceUsedAt!: string | null;
}

export class HabitTodayItemResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: Object.values(HabitType) }) type!: HabitType;
  @ApiProperty({ enum: Object.values(HabitSchedule) }) schedule!: HabitSchedule;
  @ApiPropertyOptional({ nullable: true, enum: Object.values(HabitEntryStatus) }) entryStatus!: HabitEntryStatus | null;
}

export class HabitTodayResponse {
  @ApiProperty({ type: [HabitTodayItemResponse] }) items!: HabitTodayItemResponse[];
}
