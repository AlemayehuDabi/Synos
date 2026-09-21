import { IsObject } from 'class-validator';

export class EditSuggestionDto {
  @IsObject()
  params!: Record<string, unknown>;
}
