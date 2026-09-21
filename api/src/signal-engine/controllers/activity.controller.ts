import { Controller, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CurrentUserType } from '../../common/decorators/current-user.decorator.js';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor.js';
import { ListActivityQueryDto } from '../dto/list-activity-query.dto.js';
import { ActivityService } from '../services/activity.service.js';
import { SuggestionsService } from '../services/suggestions.service.js';

@ApiTags('activity')
@Controller('activity')
export class ActivityController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly suggestionsService: SuggestionsService,
  ) {}

  @Get()
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
  @UseInterceptors(IdempotencyInterceptor)
  undo(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.suggestionsService.undoActivity(user.id, id);
  }
}
