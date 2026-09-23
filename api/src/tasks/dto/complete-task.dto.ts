import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CompleteTaskDto {
  @ApiPropertyOptional({ minimum: 0, description: 'Feeds the adaptive estimate for this task (or its recurring series).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  actualMinutes?: number;
}
