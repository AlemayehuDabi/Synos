import { IsIn } from 'class-validator';
import { ConnectionMode } from '../../generated/prisma/enums.js';

export class SetConnectionModeDto {
  @IsIn(Object.values(ConnectionMode))
  mode!: ConnectionMode;
}
