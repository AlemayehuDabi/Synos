import { IsObject, IsOptional } from 'class-validator';

export class ApproveSuggestionDto {
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}
