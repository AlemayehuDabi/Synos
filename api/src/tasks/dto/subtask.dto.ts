import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { SubtaskStatus } from '../../generated/prisma/enums.js';

export class CreateSubtaskDto {
  @ApiProperty({ example: 'Buy fertilizer' })
  @IsString()
  @Length(1, 200)
  title!: string;
}

export class UpdateSubtaskDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) title?: string;

  @ApiPropertyOptional({ enum: Object.values(SubtaskStatus) })
  @IsOptional()
  @IsIn(Object.values(SubtaskStatus))
  status?: SubtaskStatus;
}
