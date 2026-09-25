import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsCalendarDate } from '../../common/validators/is-calendar-date.js';
import { FitnessSource } from '../../generated/prisma/enums.js';

export class CreateBodyMetricDto {
  @ApiPropertyOptional({ example: '2026-09-25', description: 'Defaults to today in your timezone.' }) @IsOptional() @IsCalendarDate() date?: string;
  @ApiPropertyOptional({ description: 'Kilograms.' }) @IsOptional() @IsNumber() @Min(1) @Max(1000) weightKg?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 100 }) @IsOptional() @IsNumber() @Min(0) @Max(100) bodyFatPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiPropertyOptional({ enum: Object.values(FitnessSource), default: 'manual' }) @IsOptional() @IsIn(Object.values(FitnessSource)) source?: FitnessSource;
}

export class UpdateBodyMetricDto {
  @ApiPropertyOptional() @IsOptional() @IsCalendarDate() date?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber() @Min(1) @Max(1000) weightKg?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber() @Min(0) @Max(100) bodyFatPct?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
}

export class ListBodyMetricsQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01', description: 'Inclusive.' }) @IsOptional() @IsCalendarDate() from?: string;
  @ApiPropertyOptional({ example: '2026-09-30', description: 'Inclusive.' }) @IsOptional() @IsCalendarDate() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
