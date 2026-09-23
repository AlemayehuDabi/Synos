import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { HabitType } from '../../generated/prisma/enums.js';

export class ListHabitsQueryDto {
  @ApiPropertyOptional({ enum: Object.values(HabitType) }) @IsOptional() @IsIn(Object.values(HabitType)) type?: HabitType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isArchived?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
