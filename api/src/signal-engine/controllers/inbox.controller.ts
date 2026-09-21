import { Body, Controller, Get, Param, Patch, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CurrentUserType } from '../../common/decorators/current-user.decorator.js';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor.js';
import { ApproveSuggestionDto } from '../dto/approve-suggestion.dto.js';
import { BulkInboxDto } from '../dto/bulk-inbox.dto.js';
import { DismissSuggestionDto } from '../dto/dismiss-suggestion.dto.js';
import { EditSuggestionDto } from '../dto/edit-suggestion.dto.js';
import { ListInboxQueryDto } from '../dto/list-inbox-query.dto.js';
import { SuggestionsService } from '../services/suggestions.service.js';

@ApiTags('inbox')
@Controller('inbox')
export class InboxController {
  constructor(private readonly suggestionsService: SuggestionsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserType, @Query() query: ListInboxQueryDto) {
    return this.suggestionsService.listInbox(
      user.id,
      { status: query.status, domain: query.domain, connectionId: query.connectionId },
      { cursor: query.cursor, limit: query.limit },
    );
  }

  @Get('count')
  async count(@CurrentUser() user: CurrentUserType) {
    return { pending: await this.suggestionsService.countPending(user.id) };
  }

  @Get(':id')
  getOne(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.suggestionsService.getInboxItem(user.id, id);
  }

  @Patch(':id')
  edit(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: EditSuggestionDto) {
    return this.suggestionsService.edit(user.id, id, dto.params);
  }

  @Post(':id/approve')
  @UseInterceptors(IdempotencyInterceptor)
  approve(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: ApproveSuggestionDto) {
    return this.suggestionsService.approve(user.id, id, dto.params);
  }

  @Post(':id/dismiss')
  @UseInterceptors(IdempotencyInterceptor)
  dismiss(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: DismissSuggestionDto) {
    return this.suggestionsService.dismiss(user.id, id, dto.reason);
  }

  @Post('bulk')
  @UseInterceptors(IdempotencyInterceptor)
  bulk(@CurrentUser() user: CurrentUserType, @Body() dto: BulkInboxDto) {
    return this.suggestionsService.bulk(user.id, dto.action, dto.ids);
  }
}
