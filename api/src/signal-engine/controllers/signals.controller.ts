import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type CurrentUserType } from '../../common/decorators/current-user.decorator.js';
import { ListSignalsQueryDto } from '../dto/list-signals-query.dto.js';
import { ErrorResponse, SignalPageResponse } from '../dto/responses.dto.js';
import { SignalsService } from '../services/signals.service.js';

@ApiTags('signals')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponse, description: 'Missing or invalid session/bearer token.' })
@Controller('signals')
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  @Get()
  @ApiOperation({
    summary: 'List the signals emitted for the current user',
    description: 'Cursor-paginated, newest first. Includes signals that matched no connection or an `off` connection.',
  })
  @ApiOkResponse({ type: SignalPageResponse })
  @ApiBadRequestResponse({ type: ErrorResponse, description: 'A filter or the cursor is malformed.' })
  list(@CurrentUser() user: CurrentUserType, @Query() query: ListSignalsQueryDto) {
    return this.signalsService.list(
      user.id,
      {
        domain: query.domain,
        type: query.type,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      },
      { cursor: query.cursor, limit: query.limit },
    );
  }
}
