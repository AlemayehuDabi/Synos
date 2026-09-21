import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ReviewType } from '../../generated/prisma/enums.js';

export class ListReviewsQueryDto {
  @ApiPropertyOptional({ enum: Object.values(ReviewType), description: 'Only weekly or only monthly reviews. Both when omitted.' })
  @IsOptional()
  @IsIn(Object.values(ReviewType))
  type?: ReviewType;

  @ApiPropertyOptional({ description: 'The `nextCursor` of the previous page.' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20, description: 'Page size.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
