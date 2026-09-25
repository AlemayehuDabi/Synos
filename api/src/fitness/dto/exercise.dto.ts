import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { ExerciseCategory } from '../../generated/prisma/enums.js';

export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'core',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'full_body',
] as const;

export class CreateExerciseDto {
  @ApiProperty({ example: 'Landmine Press' })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ enum: Object.values(ExerciseCategory) })
  @IsIn(Object.values(ExerciseCategory))
  category!: ExerciseCategory;

  @ApiPropertyOptional({ enum: MUSCLE_GROUPS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MUSCLE_GROUPS.length)
  @IsIn(MUSCLE_GROUPS, { each: true })
  muscleGroups?: string[];
}

export class ListExercisesQueryDto {
  @ApiPropertyOptional({ enum: Object.values(ExerciseCategory) }) @IsOptional() @IsIn(Object.values(ExerciseCategory)) category?: ExerciseCategory;
  @ApiPropertyOptional({ enum: MUSCLE_GROUPS }) @IsOptional() @IsIn(MUSCLE_GROUPS) muscleGroup?: string;
  @ApiPropertyOptional({ description: 'Case-insensitive match on the name.' }) @IsOptional() @IsString() @MaxLength(100) q?: string;

  @ApiPropertyOptional({ description: 'true: only your own custom exercises; false: only the library.' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isCustom?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
