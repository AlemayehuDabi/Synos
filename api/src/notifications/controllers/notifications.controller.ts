import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type CurrentUserType } from '../../common/decorators/current-user.decorator.js';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor.js';
import { ErrorResponse } from '../../signal-engine/dto/responses.dto.js';
import { ListNotificationsQueryDto } from '../dto/list-notifications-query.dto.js';
import {
  MarkAllReadResponse,
  NotificationPageResponse,
  NotificationResponse,
  UnreadCountResponse,
} from '../dto/responses.dto.js';
import { NotificationsService } from '../notifications.service.js';

const IDEMPOTENCY_HEADER = {
  name: 'Idempotency-Key',
  required: false,
  description: 'Replaying the same key returns the first successful response instead of acting again.',
} as const;

@ApiTags('notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponse, description: 'Missing or invalid session/bearer token.' })
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'List in-app notifications',
    description: 'Cursor-paginated, newest first. Pass `unreadOnly=true` to see only the unread ones.',
  })
  @ApiOkResponse({ type: NotificationPageResponse })
  @ApiBadRequestResponse({ type: ErrorResponse, description: 'A filter or the cursor is malformed.' })
  list(@CurrentUser() user: CurrentUserType, @Query() query: ListNotificationsQueryDto) {
    return this.notifications.list(user.id, { unreadOnly: query.unreadOnly }, { cursor: query.cursor, limit: query.limit });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count unread notifications (for the badge)' })
  @ApiOkResponse({ type: UnreadCountResponse })
  async unreadCount(@CurrentUser() user: CurrentUserType) {
    return { unread: await this.notifications.unreadCount(user.id) };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({ summary: 'Mark every unread notification as read' })
  @ApiOkResponse({ type: MarkAllReadResponse })
  async readAll(@CurrentUser() user: CurrentUserType) {
    return { updated: await this.notifications.markAllRead(user.id) };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({
    summary: 'Mark one notification as read',
    description: 'Idempotent: an already-read notification keeps its original `readAt`.',
  })
  @ApiOkResponse({ type: NotificationResponse })
  @ApiBadRequestResponse({ type: ErrorResponse, description: '`id` is not a UUID.' })
  @ApiNotFoundResponse({ type: ErrorResponse, description: 'No such notification for this user.' })
  markRead(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user.id, id);
  }
}
