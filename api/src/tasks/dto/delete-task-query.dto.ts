import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { EDIT_SCOPES, type EditScope } from '../../calendar/dto/update-event.dto.js';

export class DeleteTaskQueryDto {
  @ApiPropertyOptional({ enum: EDIT_SCOPES, default: 'all' })
  @IsOptional()
  @IsIn(EDIT_SCOPES)
  scope?: EditScope;

  @ApiPropertyOptional({ description: 'Required unless `scope` is "all".' })
  @IsOptional()
  @IsString()
  occurrenceStart?: string;
}
