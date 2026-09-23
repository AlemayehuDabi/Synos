import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsUUID } from 'class-validator';

export class ReorderTasksDto {
  @ApiProperty({ type: [String], description: 'Every id, in the caller\'s own new order.' })
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  orderedIds!: string[];
}
