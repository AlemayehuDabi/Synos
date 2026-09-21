import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ReviewType } from '../../generated/prisma/enums.js';

export class ListReviewsQueryDto {
  @IsOptional()
  @IsIn(Object.values(ReviewType))
  type?: ReviewType;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
