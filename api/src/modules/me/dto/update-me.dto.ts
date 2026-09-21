import { IsOptional, IsUrl, Length } from 'class-validator';

export class UpdateMeDto {
  @IsOptional()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsUrl()
  image?: string;
}
