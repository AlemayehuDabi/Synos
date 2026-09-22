import {
  Body,
  Controller,
  Delete,
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
  ApiCreatedResponse,
  ApiExtraModels,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type CurrentUserType } from '../common/decorators/current-user.decorator.js';
import { IdempotencyInterceptor } from '../common/idempotency/idempotency.interceptor.js';
import { ErrorResponse } from '../signal-engine/dto/responses.dto.js';
import { CalendarEventService } from './calendar-event.service.js';
import { CalendarFreeSlotsService } from './calendar-free-slots.service.js';
import { CalendarViewService } from './calendar-view.service.js';
import { CreateCalendarEventDto } from './dto/create-event.dto.js';
import { DeleteCalendarEventQueryDto } from './dto/delete-event-query.dto.js';
import { CalendarFreeSlotsQueryDto } from './dto/free-slots-query.dto.js';
import { ListCalendarEventsQueryDto } from './dto/list-events-query.dto.js';
import {
  CalendarEventPageResponse,
  CalendarEventResponse,
  CalendarOccurrenceResponse,
  CalendarViewResponse,
  FreeSlotResponse,
} from './dto/responses.dto.js';
import { UpdateCalendarEventDto } from './dto/update-event.dto.js';
import { CalendarViewQueryDto } from './dto/view-query.dto.js';

const IDEMPOTENCY_HEADER = {
  name: 'Idempotency-Key',
  required: false,
  description: 'Replaying the same key returns the first successful response instead of creating the event again.',
} as const;

@ApiTags('calendar')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponse, description: 'Missing or invalid session/bearer token.' })
@ApiExtraModels(CalendarOccurrenceResponse)
@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly events: CalendarEventService,
    private readonly view: CalendarViewService,
    private readonly freeSlots: CalendarFreeSlotsService,
  ) {}

  @Get('view')
  @ApiOperation({
    summary: 'Merged timeline of events and soft blocks',
    description:
      'Expands recurring events and asks every registered domain for its read-only soft blocks, in parallel and each ' +
      'under a timeout, then merges everything into one list sorted by start. A failing or slow domain shows up as ' +
      '`error`/`timeout` in `contributors` instead of failing the request. The range cannot exceed 62 days.',
  })
  @ApiOkResponse({ type: CalendarViewResponse })
  @ApiBadRequestResponse({ type: ErrorResponse, description: 'Malformed dates, `to` before `from`, or the range is too wide or too far from today.' })
  getView(@CurrentUser() user: CurrentUserType, @Query() query: CalendarViewQueryDto) {
    return this.view.view(user.id, query.from, query.to, query.timezone);
  }

  @Get('free-slots')
  @ApiOperation({
    summary: 'Free windows of at least `duration` minutes',
    description: 'Treats events and busy soft blocks as busy. `dayStart`/`dayEnd` restrict results to a daily working-hours window in the caller\'s timezone.',
  })
  @ApiOkResponse({ type: [FreeSlotResponse] })
  @ApiBadRequestResponse({ type: ErrorResponse, description: 'Malformed input, the range is too wide/far, or only one of dayStart/dayEnd was given.' })
  getFreeSlots(@CurrentUser() user: CurrentUserType, @Query() query: CalendarFreeSlotsQueryDto) {
    return this.freeSlots.freeSlots(user.id, query.from, query.to, query.duration, {
      dayStart: query.dayStart,
      dayEnd: query.dayEnd,
      timezone: query.timezone,
      limit: query.limit,
    });
  }

  @Get('events')
  @ApiOperation({ summary: 'List event masters (not expanded)', description: 'Cursor-paginated, ascending by start. Filterable by from/to overlap.' })
  @ApiOkResponse({ type: CalendarEventPageResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  listEvents(@CurrentUser() user: CurrentUserType, @Query() query: ListCalendarEventsQueryDto) {
    return this.events.list(user.id, { from: query.from, to: query.to }, { cursor: query.cursor, limit: query.limit });
  }

  @Post('events')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({ summary: 'Create an event' })
  @ApiCreatedResponse({ type: CalendarEventResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiConflictResponse({ type: ErrorResponse, description: 'The client-supplied `id` already exists.' })
  createEvent(@CurrentUser() user: CurrentUserType, @Body() dto: CreateCalendarEventDto) {
    return this.events.create(user.id, dto);
  }

  @Get('events/:id')
  @ApiOperation({ summary: 'Get one event master (not expanded)' })
  @ApiOkResponse({ type: CalendarEventResponse })
  @ApiBadRequestResponse({ type: ErrorResponse, description: '`id` is not a UUID.' })
  @ApiNotFoundResponse({ type: ErrorResponse })
  getEvent(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.get(user.id, id);
  }

  @Patch('events/:id')
  @ApiOperation({
    summary: 'Update an event or one of its occurrences',
    description:
      '`scope` ("this" | "following" | "all", default "all") controls how far the change reaches on a recurring event; ' +
      '"this" and "following" require `occurrenceStart` (that occurrence\'s unmodified start). Returns the occurrence when scope is "this", the event otherwise.',
  })
  @ApiOkResponse({ schema: { oneOf: [{ $ref: '#/components/schemas/CalendarEventResponse' }, { $ref: '#/components/schemas/CalendarOccurrenceResponse' }] } })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  updateEvent(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCalendarEventDto) {
    return this.events.update(user.id, id, dto);
  }

  @Delete('events/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an event or one of its occurrences',
    description: 'Same `scope`/`occurrenceStart` as PATCH. "this" cancels one occurrence; "following" truncates the series; "all" (default) deletes the whole thing.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  async deleteEvent(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Query() query: DeleteCalendarEventQueryDto) {
    await this.events.remove(user.id, id, query.scope ?? 'all', query.occurrenceStart);
  }
}
