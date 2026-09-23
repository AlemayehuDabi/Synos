import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { IsIanaTimezone } from '../../modules/me/dto/validators.js';

export class ScheduleTaskDto {
  @ApiProperty({ nullable: true, example: '2026-09-25T09:00:00Z', description: '`null` clears scheduling.' })
  @IsOptional()
  @IsString()
  scheduledStart!: string | null;

  @ApiPropertyOptional({ example: '2026-09-25T09:30:00Z', description: 'Required together with a non-null scheduledStart.' })
  @IsOptional()
  @IsString()
  scheduledEnd?: string;

  @ApiPropertyOptional({ example: 'Africa/Nairobi', description: 'Defaults to the caller\'s own timezone.' })
  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;
}
