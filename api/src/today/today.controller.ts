import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type CurrentUserType } from '../common/decorators/current-user.decorator.js';
import { ErrorResponse } from '../signal-engine/dto/responses.dto.js';
import { TodayResponse } from './dto/responses.dto.js';
import { TodayQueryDto } from './dto/today-query.dto.js';
import { TodayService } from './today.service.js';

@ApiTags('today')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponse, description: 'Missing or invalid session/bearer token.' })
@Controller('today')
export class TodayController {
  constructor(private readonly today: TodayService) {}

  @Get()
  @ApiOperation({
    summary: 'Everything for one day, across domains',
    description:
      'Asks every registered domain what it has for the day, in parallel and each under a timeout, so one slow or failing domain shows up as `error`/`timeout` in its own section instead of failing the request. `date` defaults to today in the user\'s timezone.',
  })
  @ApiOkResponse({ type: TodayResponse })
  @ApiBadRequestResponse({ type: ErrorResponse, description: '`date` is not a real YYYY-MM-DD calendar date.' })
  get(@CurrentUser() user: CurrentUserType, @Query() query: TodayQueryDto) {
    return this.today.getToday(user.id, query.date);
  }
}
