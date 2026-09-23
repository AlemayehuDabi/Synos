import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SkipTaskDto {
  @ApiPropertyOptional({ description: 'Which occurrence, by its unmodified due date. Defaults to the task\'s own current dueAt.' })
  @IsOptional()
  @IsString()
  occurrenceStart?: string;
}
