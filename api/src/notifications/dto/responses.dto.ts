import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationCategory, SignalDomain } from '../../generated/prisma/enums.js';

export class NotificationResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: Object.values(NotificationCategory) }) category!: NotificationCategory;
  @ApiPropertyOptional({ enum: Object.values(SignalDomain), nullable: true }) domain!: SignalDomain | null;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ type: Object, description: 'Free-form payload for deep links, e.g. { suggestionId }.' }) data!: unknown;
  @ApiPropertyOptional({ type: Date, nullable: true, description: 'Null while unread.' }) readAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}

export class NotificationPageResponse {
  @ApiProperty({ type: [NotificationResponse] }) items!: NotificationResponse[];
  @ApiProperty({ type: String, nullable: true, description: 'Pass as `cursor` for the next page; null on the last page.' })
  nextCursor!: string | null;
}

export class UnreadCountResponse {
  @ApiProperty({ example: 4 }) unread!: number;
}

export class MarkAllReadResponse {
  @ApiProperty({ example: 4, description: 'How many notifications were unread and are now read.' }) updated!: number;
}

export class CategoryPreferenceResponse {
  @ApiProperty({ enum: Object.values(NotificationCategory) }) category!: NotificationCategory;
  @ApiProperty() inApp!: boolean;
  @ApiProperty() push!: boolean;
}

export class QuietHoursResponse {
  @ApiProperty({ type: String, nullable: true, example: '22:00' }) start!: string | null;
  @ApiProperty({ type: String, nullable: true, example: '07:00' }) end!: string | null;
  @ApiProperty({ example: 'Africa/Nairobi', description: 'The user\'s timezone (from their settings) the times are read in.' })
  timezone!: string;
}

export class NotificationPreferencesResponse {
  @ApiProperty({ type: [CategoryPreferenceResponse], description: 'One entry per category, defaults filled in.' })
  categories!: CategoryPreferenceResponse[];
  @ApiProperty({ type: QuietHoursResponse }) quietHours!: QuietHoursResponse;
}
