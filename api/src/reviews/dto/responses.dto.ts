import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReviewType } from '../../generated/prisma/enums.js';

export class ReviewSectionResponse {
  @ApiProperty({
    example: 'finance',
    description: 'A domain name, or `cross_domain` for the built-in section about what the signal engine did.',
  })
  domain!: string;

  @ApiProperty({ enum: ['ok', 'error', 'timeout'], description: 'Only `ok` sections carry metrics and highlights.' })
  status!: 'ok' | 'error' | 'timeout';

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Domain-defined numbers, strings and flags, e.g. `{ "billsPaid": 3 }`.',
  })
  metrics?: Record<string, number | string | boolean | null>;

  @ApiPropertyOptional({ type: [String], description: 'Short human-readable lines worth showing.' })
  highlights?: string[];
}

export class ReviewResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: Object.values(ReviewType) }) type!: ReviewType;
  @ApiProperty({ example: '2026-09-14', description: 'First local day covered, inclusive.' }) periodStart!: string;
  @ApiProperty({ example: '2026-09-20', description: 'Last local day covered, inclusive.' }) periodEnd!: string;
  @ApiProperty({ example: 'Africa/Nairobi', description: 'The timezone the period was cut in when the review was generated.' })
  timezone!: string;
  @ApiProperty({ type: [ReviewSectionResponse], description: 'One section per registered domain, then `cross_domain`.' })
  sections!: ReviewSectionResponse[];
  @ApiProperty() generatedAt!: Date;
}

export class ReviewPageResponse {
  @ApiProperty({ type: [ReviewResponse] }) items!: ReviewResponse[];
  @ApiProperty({ type: String, nullable: true, description: 'Pass as `cursor` for the next page; null on the last page.' })
  nextCursor!: string | null;
}
