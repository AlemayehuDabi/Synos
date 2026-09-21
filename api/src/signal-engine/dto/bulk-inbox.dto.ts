import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsUUID } from 'class-validator';

export class BulkInboxDto {
  @IsIn(['approve', 'dismiss'])
  action!: 'approve' | 'dismiss';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  ids!: string[];
}
