import { IsIn, IsOptional } from 'class-validator';

const VISIBILITY = ['private', 'shared'] as const;
type Visibility = (typeof VISIBILITY)[number];

export class UpdatePrivacyDto {
  @IsOptional()
  @IsIn(VISIBILITY)
  calendar?: Visibility;

  @IsOptional()
  @IsIn(VISIBILITY)
  tasks?: Visibility;

  @IsOptional()
  @IsIn(VISIBILITY)
  habits?: Visibility;

  @IsOptional()
  @IsIn(VISIBILITY)
  fitness?: Visibility;

  @IsOptional()
  @IsIn(VISIBILITY)
  finances?: Visibility;

  @IsOptional()
  @IsIn(VISIBILITY)
  meals?: Visibility;
}
