import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { ApproveSuggestionDto } from '../dto/approve-suggestion.dto.js';
import { BulkInboxDto } from '../dto/bulk-inbox.dto.js';
import { DismissSuggestionDto } from '../dto/dismiss-suggestion.dto.js';
import { EditSuggestionDto } from '../dto/edit-suggestion.dto.js';
import { ListInboxQueryDto } from '../dto/list-inbox-query.dto.js';
import {
  BulkResultResponse,
  ErrorResponse,
  InboxItemResponse,
  PendingCountResponse,
  SuggestionPageResponse,
} from '../dto/responses.dto.js';
import { SuggestionsService } from '../services/suggestions.service.js';

const IDEMPOTENCY_HEADER = {
  name: 'Idempotency-Key',
  required: false,
  description: 'Replaying the same key returns the first successful response instead of acting again.',
} as const;

@ApiTags('inbox')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponse, description: 'Missing or invalid session/bearer token.' })
@Controller('inbox')
export class InboxController {
  constructor(private readonly suggestionsService: SuggestionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List suggestions',
    description: 'Cursor-paginated, newest first. Defaults to `status=pending`.',
  })
  @ApiOkResponse({ type: SuggestionPageResponse })
  @ApiBadRequestResponse({ type: ErrorResponse, description: 'A filter or the cursor is malformed.' })
  list(@CurrentUser() user: CurrentUserType, @Query() query: ListInboxQueryDto) {
    return this.suggestionsService.listInbox(
      user.id,
      { status: query.status, domain: query.domain, connectionId: query.connectionId },
      { cursor: query.cursor, limit: query.limit },
    );
  }

  @Get('count')
  @ApiOperation({ summary: 'Count pending suggestions (for the inbox badge)' })
  @ApiOkResponse({ type: PendingCountResponse })
  async count(@CurrentUser() user: CurrentUserType) {
    return { pending: await this.suggestionsService.countPending(user.id) };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one suggestion in full',
    description: 'Includes the triggering signal, the current and original params, and the suggestion\'s activity history.',
  })
  @ApiOkResponse({ type: InboxItemResponse })
  @ApiBadRequestResponse({ type: ErrorResponse, description: '`id` is not a UUID.' })
  @ApiNotFoundResponse({ type: ErrorResponse, description: 'No such suggestion for this user.' })
  getOne(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.suggestionsService.getInboxItem(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit the params of a pending suggestion',
    description:
      'Validated against the action handler\'s params schema. The params as first proposed are kept in `originalParams` on the first edit.',
  })
  @ApiOkResponse({ type: InboxItemResponse })
  @ApiBadRequestResponse({ type: ErrorResponse, description: 'Malformed request body, or `id` is not a UUID.' })
  @ApiNotFoundResponse({ type: ErrorResponse, description: 'No such suggestion for this user.' })
  @ApiConflictResponse({ type: ErrorResponse, description: 'The suggestion is not pending (any more).' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponse, description: 'The params fail the action handler\'s schema.' })
  edit(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditSuggestionDto,
  ) {
    return this.suggestionsService.edit(user.id, id, dto.params);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({
    summary: 'Approve a pending suggestion',
    description:
      'Applies it through its action handler. Pass `params` to edit and approve in one call. Of several concurrent calls for the same suggestion, exactly one wins.',
  })
  @ApiOkResponse({ type: InboxItemResponse })
  @ApiNotFoundResponse({ type: ErrorResponse, description: 'No such suggestion for this user.' })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: 'Not pending (any more), or the handler reported a conflict, in which case the suggestion becomes `superseded`.',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponse,
    description: 'The params fail the handler\'s schema, or the handler threw (the suggestion becomes `failed`).',
  })
  approve(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveSuggestionDto,
  ) {
    return this.suggestionsService.approve(user.id, id, dto.params);
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({ summary: 'Dismiss a pending suggestion' })
  @ApiOkResponse({ type: InboxItemResponse })
  @ApiNotFoundResponse({ type: ErrorResponse, description: 'No such suggestion for this user.' })
  @ApiConflictResponse({ type: ErrorResponse, description: 'The suggestion is not pending (any more).' })
  dismiss(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DismissSuggestionDto,
  ) {
    return this.suggestionsService.dismiss(user.id, id, dto.reason);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({
    summary: 'Approve or dismiss several suggestions at once',
    description:
      'Never all-or-nothing: each id is processed independently and reported in the response, so one failure does not affect the rest.',
  })
  @ApiOkResponse({ type: [BulkResultResponse] })
  @ApiBadRequestResponse({ type: ErrorResponse, description: 'Not 1-50 UUIDs, or an unknown action.' })
  bulk(@CurrentUser() user: CurrentUserType, @Body() dto: BulkInboxDto) {
    return this.suggestionsService.bulk(user.id, dto.action, dto.ids);
  }
}
