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
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser, type CurrentUserType } from '../../common/decorators/current-user.decorator.js';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor.js';
import { ListActivityQueryDto } from '../dto/list-activity-query.dto.js';
import { ActivityPageResponse, ErrorResponse, InboxItemResponse } from '../dto/responses.dto.js';
import { ActivityService } from '../services/activity.service.js';
import { SuggestionsService } from '../services/suggestions.service.js';

@ApiTags('activity')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponse, description: 'Missing or invalid session/bearer token.' })
@Controller('activity')
export class ActivityController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly suggestionsService: SuggestionsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'The audit log of everything the engine did or the user decided',
    description: 'Cursor-paginated, newest first.',
  })
  @ApiOkResponse({ type: ActivityPageResponse })
  @ApiBadRequestResponse({ type: ErrorResponse, description: 'A filter or the cursor is malformed.' })
  list(@CurrentUser() user: CurrentUserType, @Query() query: ListActivityQueryDto) {
    return this.activityService.list(
      user.id,
      {
        kind: query.kind,
        domain: query.domain,
        connectionId: query.connectionId,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      },
      { cursor: query.cursor, limit: query.limit },
    );
  }

  @Post(':id/undo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Replaying the same key returns the first successful response instead of acting again.',
  })
  @ApiOperation({
    summary: 'Undo an approved or auto-applied action',
    description:
      '`id` must be a `suggestion_approved` or `auto_applied` activity entry whose action handler supports revert, that has not been undone yet, and that is within `UNDO_WINDOW_DAYS`. Of several concurrent calls, exactly one wins.',
  })
  @ApiOkResponse({ type: InboxItemResponse })
  @ApiBadRequestResponse({ type: ErrorResponse, description: '`id` is not a UUID.' })
  @ApiNotFoundResponse({ type: ErrorResponse, description: 'No such activity entry for this user.' })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: 'Already undone, or the target changed since it was applied (the handler reported a conflict).',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponse,
    description: 'Not an approval/auto-apply entry, the handler does not support revert, or the undo window has passed.',
  })
  undo(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.suggestionsService.undoActivity(user.id, id);
  }
}
