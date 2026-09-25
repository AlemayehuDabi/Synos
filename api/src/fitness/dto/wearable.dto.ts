import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsObject, IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { IsCalendarDate } from '../../common/validators/is-calendar-date.js';
import { WearableSampleType } from '../../generated/prisma/enums.js';

export const MAX_SAMPLES_PER_BATCH = 500;

export class WearableSampleDto {
  @ApiProperty({ enum: Object.values(WearableSampleType) })
  @IsIn(Object.values(WearableSampleType))
  type!: WearableSampleType;

  @ApiProperty({ example: '2026-09-24T22:30:00Z' }) @IsDateString() startsAt!: string;
  @ApiProperty({ example: '2026-09-25T06:10:00Z' }) @IsDateString() endsAt!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'steps `{ count }`, sleep `{ durationMinutes? }`, heartRate `{ bpm }`, activeEnergy `{ kcal }`, workout `{ workoutType?, durationMinutes? }`; extra keys are kept.',
  })
  @IsObject()
  value!: Record<string, unknown>;

  @ApiProperty({ example: 'Apple Watch' }) @IsString() @Length(1, 100) sourceDevice!: string;

  @ApiProperty({ description: 'Unique per user: sending the same key again is counted as a duplicate and ignored.' })
  @IsString()
  @Length(1, 200)
  dedupeKey!: string;
}

export class IngestSamplesDto {
  @ApiProperty({ type: [WearableSampleDto], maxItems: MAX_SAMPLES_PER_BATCH })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SAMPLES_PER_BATCH)
  @ValidateNested({ each: true })
  @Type(() => WearableSampleDto)
  samples!: WearableSampleDto[];
}

export class SleepQueryDto {
  @ApiPropertyOptional({ example: '2026-09-19', description: 'First wake-up date, inclusive. Defaults to 6 days before `to`.' }) @IsOptional() @IsCalendarDate() from?: string;
  @ApiPropertyOptional({ example: '2026-09-25', description: 'Last wake-up date, inclusive. Defaults to today in your timezone.' }) @IsOptional() @IsCalendarDate() to?: string;
}
