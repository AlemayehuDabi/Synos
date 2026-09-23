import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { EDIT_SCOPES, type EditScope } from '../../calendar/dto/update-event.dto.js';
import { IsValidRRule } from '../../calendar/recurrence/rrule.js';

export class UpdateRecurrenceDto {
  @ApiProperty({ nullable: true, example: 'FREQ=WEEKLY;BYDAY=MO,WE,FR', description: '`null` removes recurrence.' })
  @IsOptional()
  @IsValidRRule()
  rrule!: string | null;

  @ApiPropertyOptional({ enum: EDIT_SCOPES, default: 'all' })
  @IsOptional()
  @IsIn(EDIT_SCOPES)
  scope?: EditScope;

  @ApiPropertyOptional({ description: 'Required unless `scope` is "all".' })
  @IsOptional()
  @IsString()
  occurrenceStart?: string;
}
