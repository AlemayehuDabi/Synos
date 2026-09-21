import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type CurrentUserType } from '../../common/decorators/current-user.decorator.js';
import { ErrorResponse } from '../../signal-engine/dto/responses.dto.js';
import { UpdateNotificationPreferencesDto } from '../dto/update-notification-preferences.dto.js';
import { NotificationPreferencesResponse } from '../dto/responses.dto.js';
import { NotificationPreferencesService } from '../notification-preferences.service.js';

@ApiTags('notification-preferences')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponse, description: 'Missing or invalid session/bearer token.' })
@Controller('notification-preferences')
export class NotificationPreferencesController {
  constructor(private readonly preferences: NotificationPreferencesService) {}

  @Get()
  @ApiOperation({
    summary: 'Get notification preferences',
    description:
      'Every category with its in-app and push switches (defaults filled in: everything is on), plus the quiet hours.',
  })
  @ApiOkResponse({ type: NotificationPreferencesResponse })
  get(@CurrentUser() user: CurrentUserType) {
    return this.preferences.get(user.id);
  }

  @Patch()
  @ApiOperation({
    summary: 'Update notification preferences (partial)',
    description:
      'Send only what changes. `categories` lists the categories to change; `quietHours` sets a "HH:mm" start and end read in the user\'s timezone (a range may wrap past midnight), or `null` to turn them off. Quiet hours suppress push only, never in-app.',
  })
  @ApiOkResponse({ type: NotificationPreferencesResponse })
  @ApiBadRequestResponse({
    type: ErrorResponse,
    description:
      'Unknown category, malformed time, only one of start/end given, start equal to end, or a category listed twice.',
  })
  update(@CurrentUser() user: CurrentUserType, @Body() dto: UpdateNotificationPreferencesDto) {
    return this.preferences.update(user.id, dto);
  }
}
