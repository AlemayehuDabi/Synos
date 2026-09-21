import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SignalDomain, SuggestionStatus } from '../../generated/prisma/enums.js';

export class ListInboxQueryDto {
  @IsOptional()
  @IsIn(Object.values(SuggestionStatus))
  status?: SuggestionStatus;

  @IsOptional()
  @IsIn(Object.values(SignalDomain))
  domain?: SignalDomain;

  @IsOptional()
  @IsString()
  connectionId?: string;

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
