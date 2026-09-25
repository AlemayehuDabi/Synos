import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExerciseCategory, FitnessSource } from '../../generated/prisma/enums.js';

const nullable = { nullable: true } as const;

export class ExerciseResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: Object.values(ExerciseCategory) }) category!: ExerciseCategory;
  @ApiProperty({ type: [String] }) muscleGroups!: string[];
  @ApiProperty({ description: 'false for the read-only library, true for your own additions.' }) isCustom!: boolean;
}

export class ExercisePageResponse {
  @ApiProperty({ type: [ExerciseResponse] }) items!: ExerciseResponse[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class WorkoutSetResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() setNumber!: number;
  @ApiPropertyOptional(nullable) reps!: number | null;
  @ApiPropertyOptional(nullable) weightKg!: number | null;
  @ApiPropertyOptional(nullable) durationSeconds!: number | null;
  @ApiPropertyOptional(nullable) distanceMeters!: number | null;
  @ApiPropertyOptional(nullable) rpe!: number | null;
}

export class WorkoutExerciseResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) exerciseId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: Object.values(ExerciseCategory) }) category!: ExerciseCategory;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: [WorkoutSetResponse] }) sets!: WorkoutSetResponse[];
}

export class WorkoutResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiPropertyOptional(nullable) title!: string | null;
  @ApiProperty() workoutType!: string;
  @ApiProperty({ description: 'ISO instant.' }) startedAt!: string;
  @ApiPropertyOptional({ ...nullable, description: 'ISO instant; null while the workout is still in progress.' }) completedAt!: string | null;
  @ApiPropertyOptional(nullable) durationMinutes!: number | null;
  @ApiPropertyOptional(nullable) notes!: string | null;
  @ApiPropertyOptional({ ...nullable, format: 'uuid' }) programId!: string | null;
  @ApiProperty({ enum: Object.values(FitnessSource) }) source!: FitnessSource;
  @ApiProperty({ type: [WorkoutExerciseResponse] }) exercises!: WorkoutExerciseResponse[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class WorkoutPageResponse {
  @ApiProperty({ type: [WorkoutResponse] }) items!: WorkoutResponse[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class ProgramWorkoutResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() dayOffset!: number;
  @ApiProperty({ type: 'object', additionalProperties: true }) workoutTemplate!: Record<string, unknown>;
}

export class ProgramResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional(nullable) description!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiPropertyOptional({ ...nullable, description: 'When it was activated - day zero for every dayOffset.' }) activatedAt!: string | null;
  @ApiProperty({ type: [ProgramWorkoutResponse] }) workouts!: ProgramWorkoutResponse[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class ProgramPageResponse {
  @ApiProperty({ type: [ProgramResponse] }) items!: ProgramResponse[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class BodyMetricResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '2026-09-25' }) date!: string;
  @ApiPropertyOptional(nullable) weightKg!: number | null;
  @ApiPropertyOptional(nullable) bodyFatPct!: number | null;
  @ApiPropertyOptional(nullable) notes!: string | null;
  @ApiProperty({ enum: Object.values(FitnessSource) }) source!: FitnessSource;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class BodyMetricPageResponse {
  @ApiProperty({ type: [BodyMetricResponse] }) items!: BodyMetricResponse[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class IngestSamplesResponse {
  @ApiProperty({ description: 'Samples in the request.' }) received!: number;
  @ApiProperty({ description: 'Stored as new samples.' }) created!: number;
  @ApiProperty({ description: 'Ignored: their dedupeKey was already stored, or repeated within the batch.' }) duplicates!: number;
  @ApiProperty({ description: 'Of the created ones, how many overlap a manual workout but disagree with it.' }) conflicts!: number;
}

export class SleepNightResponse {
  @ApiProperty({ example: '2026-09-25', description: 'The local date the night ended on.' }) date!: string;
  @ApiProperty() durationMinutes!: number;
  @ApiProperty() sampleCount!: number;
  @ApiProperty({ description: 'Whether it is under the sleep.poor threshold.' }) poor!: boolean;
}

export class SleepResponse {
  @ApiProperty({ example: '2026-09-19' }) from!: string;
  @ApiProperty({ example: '2026-09-25' }) to!: string;
  @ApiProperty({ example: 'Africa/Nairobi' }) timezone!: string;
  @ApiProperty({ description: 'FITNESS_SLEEP_POOR_THRESHOLD_MIN.' }) thresholdMinutes!: number;
  @ApiProperty({ type: [SleepNightResponse] }) nights!: SleepNightResponse[];
}
