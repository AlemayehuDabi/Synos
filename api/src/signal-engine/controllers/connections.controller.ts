import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type CurrentUserType } from '../../common/decorators/current-user.decorator.js';
import { SetConnectionModeDto } from '../dto/set-connection-mode.dto.js';
import { ConnectionResponse, ErrorResponse } from '../dto/responses.dto.js';
import { ConnectionsService } from '../services/connections.service.js';

@ApiTags('connections')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponse, description: 'Missing or invalid session/bearer token.' })
@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List every connection with the current user\'s mode',
    description:
      'The connection catalog is fixed in code; this merges it with the user\'s stored settings. `available` is false until a domain module registers a rule for the connection.',
  })
  @ApiOkResponse({ type: [ConnectionResponse] })
  list(@CurrentUser() user: CurrentUserType) {
    return this.connectionsService.listForUser(user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Set a connection\'s mode',
    description:
      '`off` records signals but proposes nothing, `suggest` creates pending suggestions, `auto` applies them immediately. The mode may not exceed the connection\'s `maxMode`. Pending suggestions from a connection switched to `off` are left as they are.',
  })
  @ApiOkResponse({ type: ConnectionResponse })
  @ApiBadRequestResponse({ type: ErrorResponse, description: 'The mode is above the connection\'s `maxMode`, or is not a valid mode.' })
  @ApiNotFoundResponse({ type: ErrorResponse, description: 'Unknown connection id.' })
  setMode(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: SetConnectionModeDto) {
    return this.connectionsService.setMode(user.id, id, dto.mode);
  }
}
