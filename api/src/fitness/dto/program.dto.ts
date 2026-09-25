import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class ProgramWorkoutDto {
  @ApiProperty({ minimum: 0, description: 'Days after the program is activated.' }) @IsInt() @Min(0) @Max(3650) dayOffset!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { workoutType: 'strength', title: 'Upper body', durationMinutes: 60, exercises: [{ exerciseId: '00000000-0000-4000-8000-000000000000', sets: [{ reps: 8, weightKg: 60 }] }] },
    description: '`{ workoutType, title?, durationMinutes?, exercises?: [{ exerciseId, sets?: [{ reps?, weightKg?, durationSeconds?, distanceMeters?, rpe? }] }] }`.',
  })
  @IsObject()
  workoutTemplate!: Record<string, unknown>;
}

export class CreateProgramDto {
  @ApiProperty({ example: '12-week strength' }) @IsString() @Length(1, 200) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;

  @ApiPropertyOptional({ type: [ProgramWorkoutDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ProgramWorkoutDto)
  workouts?: ProgramWorkoutDto[];
}

export class UpdateProgramDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) name?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(5000) description?: string | null;

  @ApiPropertyOptional({ type: [ProgramWorkoutDto], description: 'When present, replaces every planned session.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ProgramWorkoutDto)
  workouts?: ProgramWorkoutDto[];
}

export class ListProgramsQueryDto {
  @ApiPropertyOptional({ description: 'true: only the active program; false: only inactive ones.' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
