import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { IsIanaTimezone, IsIso4217Currency } from './validators.js';

export class UpdateSettingsDto {
  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weekStartsOn?: number;

  @IsOptional()
  @IsIn(['metric', 'imperial'])
  units?: 'metric' | 'imperial';

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIso4217Currency()
  currency?: string;

  @IsOptional()
  @IsString()
  locale?: string;
}
