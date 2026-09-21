import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, Matches, ValidateNested } from 'class-validator';
import { NOTIFICATION_CATEGORIES } from '../categories.js';
import { TIME_OF_DAY_PATTERN } from '../quiet-hours.js';
import type { NotificationCategory } from '../../generated/prisma/enums.js';

export class CategoryPreferenceDto {
  @ApiProperty({ enum: NOTIFICATION_CATEGORIES })
  @IsIn(NOTIFICATION_CATEGORIES)
  category!: NotificationCategory;

  @ApiPropertyOptional({ description: 'Keep this category in the in-app inbox. Left as it is when omitted.' })
  @IsOptional()
  @IsBoolean()
  inApp?: boolean;

  @ApiPropertyOptional({ description: 'Send this category as a push notification. Left as it is when omitted.' })
  @IsOptional()
  @IsBoolean()
  push?: boolean;
}

export class QuietHoursDto {
  @ApiPropertyOptional({ type: String, nullable: true, example: '22:00', description: '24-hour "HH:mm", inclusive.' })
  @IsOptional()
  @Matches(TIME_OF_DAY_PATTERN, { message: 'start must be a 24-hour "HH:mm" time' })
  start?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '07:00', description: '24-hour "HH:mm", exclusive. May be earlier than `start`: the range then wraps past midnight.' })
  @IsOptional()
  @Matches(TIME_OF_DAY_PATTERN, { message: 'end must be a 24-hour "HH:mm" time' })
  end?: string | null;
}

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ type: [CategoryPreferenceDto], description: 'The categories to change. Each may appear once.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(NOTIFICATION_CATEGORIES.length)
  @ValidateNested({ each: true })
  @Type(() => CategoryPreferenceDto)
  categories?: CategoryPreferenceDto[];

  @ApiPropertyOptional({
    type: QuietHoursDto,
    nullable: true,
    description: 'Push is held back inside this range, read in the user\'s timezone. `null` turns quiet hours off.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuietHoursDto)
  quietHours?: QuietHoursDto | null;
}
