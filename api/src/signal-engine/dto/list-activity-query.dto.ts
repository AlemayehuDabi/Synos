import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ActivityKind, SignalDomain } from '../../generated/prisma/enums.js';

export class ListActivityQueryDto {
  @IsOptional()
  @IsIn(Object.values(ActivityKind))
  kind?: ActivityKind;

  @IsOptional()
  @IsIn(Object.values(SignalDomain))
  domain?: SignalDomain;

  @IsOptional()
  @IsString()
  connectionId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

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
