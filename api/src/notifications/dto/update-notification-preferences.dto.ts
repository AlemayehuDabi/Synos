import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, Matches, ValidateNested } from 'class-validator';
import { NOTIFICATION_CATEGORIES } from '../categories.js';
import { TIME_OF_DAY_PATTERN } from '../quiet-hours.js';
import type { NotificationCategory } from '../../generated/prisma/enums.js';

export class CategoryPreferenceDto {
  @IsIn(NOTIFICATION_CATEGORIES)
  category!: NotificationCategory;

  @IsOptional()
  @IsBoolean()
  inApp?: boolean;

  @IsOptional()
  @IsBoolean()
  push?: boolean;
}

export class QuietHoursDto {
  @IsOptional()
  @Matches(TIME_OF_DAY_PATTERN, { message: 'start must be a 24-hour "HH:mm" time' })
  start?: string | null;

  @IsOptional()
  @Matches(TIME_OF_DAY_PATTERN, { message: 'end must be a 24-hour "HH:mm" time' })
  end?: string | null;
}

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(NOTIFICATION_CATEGORIES.length)
  @ValidateNested({ each: true })
  @Type(() => CategoryPreferenceDto)
  categories?: CategoryPreferenceDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => QuietHoursDto)
  quietHours?: QuietHoursDto | null;
}
