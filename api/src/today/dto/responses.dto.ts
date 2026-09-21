import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SignalDomain } from '../../generated/prisma/enums.js';

export class TodayItemResponse {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
}

export class TodaySectionResponse {
  @ApiProperty({ enum: Object.values(SignalDomain) }) domain!: SignalDomain;
  @ApiProperty({
    enum: ['ok', 'error', 'timeout'],
    description: 'Only `ok` sections carry `summary` and `items`; a failing or slow domain never fails the request.',
  })
  status!: 'ok' | 'error' | 'timeout';
  @ApiPropertyOptional({ type: Object, description: 'Domain-defined rollup, e.g. { open: 3 }.' }) summary?: Record<string, unknown>;
  @ApiPropertyOptional({ type: [TodayItemResponse], description: 'Each item also carries whatever extra fields its domain adds.' })
  items?: TodayItemResponse[];
}

export class TodayInboxResponse {
  @ApiProperty({ example: 2, description: 'Signal-engine suggestions waiting for the user.' }) pending!: number;
}

export class TodayResponse {
  @ApiProperty({ example: '2026-09-21' }) date!: string;
  @ApiProperty({ example: 'Africa/Nairobi' }) timezone!: string;
  @ApiProperty({ type: [TodaySectionResponse], description: 'One per registered domain, in a fixed domain order.' })
  sections!: TodaySectionResponse[];
  @ApiProperty({ type: TodayInboxResponse }) inbox!: TodayInboxResponse;
}
