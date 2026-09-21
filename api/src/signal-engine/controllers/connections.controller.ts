import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CurrentUserType } from '../../common/decorators/current-user.decorator.js';
import { SetConnectionModeDto } from '../dto/set-connection-mode.dto.js';
import { ConnectionsService } from '../services/connections.service.js';

@ApiTags('connections')
@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserType) {
    return this.connectionsService.listForUser(user.id);
  }

  @Patch(':id')
  setMode(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: SetConnectionModeDto) {
    return this.connectionsService.setMode(user.id, id, dto.mode);
  }
}
