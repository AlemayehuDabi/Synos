import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FitnessSource } from '../../generated/prisma/enums.js';

export class WorkoutSetDto {
  @ApiPropertyOptional({ minimum: 1, description: 'Defaults to the set\'s position in the list.' }) @IsOptional() @IsInt() @Min(1) @Max(1000) setNumber?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10_000) reps?: number;
  @ApiPropertyOptional({ description: 'Kilograms.' }) @IsOptional() @IsNumber() @Min(0) @Max(2000) weightKg?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(86_400) durationSeconds?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1_000_000) distanceMeters?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 10, description: 'Rate of perceived exertion.' }) @IsOptional() @IsNumber() @Min(1) @Max(10) rpe?: number;
}

export class WorkoutExerciseDto {
  @ApiProperty({ format: 'uuid', description: 'A library exercise, or one of your own custom ones.' })
  @IsUUID('4')
  exerciseId!: string;

  @ApiPropertyOptional({ minimum: 0, description: 'Defaults to the exercise\'s position in the list.' }) @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;

  @ApiPropertyOptional({ type: [WorkoutSetDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => WorkoutSetDto)
  sets?: WorkoutSetDto[];
}

export class CreateWorkoutDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Client-supplied id. Creating an id that already exists is a 409.' })
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) title?: string;

  @ApiProperty({ example: 'run', description: 'Free-form type; connections such as workout-to-habit match on it.' })
  @IsString()
  @Length(1, 50)
  workoutType!: string;

  @ApiProperty({ example: '2026-09-25T07:00:00Z' }) @IsDateString() startedAt!: string;
  @ApiPropertyOptional({ example: '2026-09-25T07:45:00Z', description: 'Set only for a workout that is already over; otherwise use POST /workouts/:id/complete.' })
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsInt() @Min(1) @Max(1440) durationMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'One of your own programs.' }) @IsOptional() @IsUUID('4') programId?: string;

  @ApiPropertyOptional({ enum: Object.values(FitnessSource), default: 'manual' })
  @IsOptional()
  @IsIn(Object.values(FitnessSource))
  source?: FitnessSource;

  @ApiPropertyOptional({ type: [WorkoutExerciseDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WorkoutExerciseDto)
  exercises?: WorkoutExerciseDto[];
}

export class UpdateWorkoutDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @Length(1, 200) title?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 50) workoutType?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startedAt?: string;
  @ApiPropertyOptional({ nullable: true, minimum: 1 }) @IsOptional() @IsInt() @Min(1) @Max(1440) durationMinutes?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(5000) notes?: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) @IsOptional() @IsUUID('4') programId?: string | null;

  @ApiPropertyOptional({ type: [WorkoutExerciseDto], description: 'When present, replaces every exercise and set of the workout.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WorkoutExerciseDto)
  exercises?: WorkoutExerciseDto[];
}

export class CompleteWorkoutDto {
  @ApiPropertyOptional({ example: '2026-09-25T07:45:00Z', description: 'Defaults to now.' }) @IsOptional() @IsDateString() completedAt?: string;
  @ApiPropertyOptional({ minimum: 1, description: 'Defaults to the workout\'s own, else the time from startedAt to completedAt.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number;
}

export class ListWorkoutsQueryDto {
  @ApiPropertyOptional({ description: 'Only workouts that started at or after this instant.' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ description: 'Only workouts that started before this instant.' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 50) workoutType?: string;

  @ApiPropertyOptional({ description: 'true: only completed workouts; false: only ones still in progress.' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  completed?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
