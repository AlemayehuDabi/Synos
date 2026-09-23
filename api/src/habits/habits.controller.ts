import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseInterceptors } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
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
import { CreateHabitDto } from './dto/create-habit.dto.js';
import { ListEntriesQueryDto } from './dto/list-entries-query.dto.js';
import { ListHabitsQueryDto } from './dto/list-habits-query.dto.js';
import { UpdateEntryDto } from './dto/update-entry.dto.js';
import { UpdateHabitDto } from './dto/update-habit.dto.js';
import { UpsertEntryDto } from './dto/upsert-entry.dto.js';
import { HabitEntryResponse, HabitPageResponse, HabitResponse, HabitStatsResponse } from './dto/responses.dto.js';
import { HabitEntryService } from './habit-entry.service.js';
import { HabitStatsService } from './habit-stats.service.js';
import { HabitService } from './habit.service.js';

const IDEMPOTENCY_HEADER = {
  name: 'Idempotency-Key',
  required: false,
  description: 'Replaying the same key returns the first successful response instead of acting again.',
} as const;

@ApiTags('habits')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponse, description: 'Missing or invalid session/bearer token.' })
@Controller('habits')
export class HabitsController {
  constructor(
    private readonly habits: HabitService,
    private readonly entries: HabitEntryService,
    private readonly stats: HabitStatsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List habits', description: 'Cursor-paginated, oldest created first.' })
  @ApiOkResponse({ type: HabitPageResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  list(@CurrentUser() user: CurrentUserType, @Query() query: ListHabitsQueryDto) {
    return this.habits.list(user.id, { type: query.type, isArchived: query.isArchived }, { cursor: query.cursor, limit: query.limit });
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({ summary: 'Create a habit' })
  @ApiCreatedResponse({ type: HabitResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiConflictResponse({ type: ErrorResponse, description: 'The client-supplied `id` already exists.' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateHabitDto) {
    return this.habits.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one habit' })
  @ApiOkResponse({ type: HabitResponse })
  @ApiBadRequestResponse({ type: ErrorResponse, description: '`id` is not a UUID.' })
  @ApiNotFoundResponse({ type: ErrorResponse })
  get(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.habits.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a habit' })
  @ApiOkResponse({ type: HabitResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  update(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHabitDto) {
    return this.habits.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a habit' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  async remove(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    await this.habits.remove(user.id, id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a habit', description: 'Idempotent: archiving an already-archived habit is a no-op.' })
  @ApiOkResponse({ type: HabitResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  archive(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.habits.archive(user.id, id);
  }

  @Get(':id/stats')
  @ApiOperation({
    summary: 'Current and best streak',
    description:
      'Computed against the habit\'s own schedule, not every calendar day - a weekly habit\'s streak is a streak of weeks. ' +
      'A single missed scheduled unit within HABITS_GRACE_WINDOW_DAYS does not reset the streak if the next one is completed.',
  })
  @ApiOkResponse({ type: HabitStatsResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  async getStats(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    const result = await this.stats.stats(user.id, id);
    return { habitId: id, ...result };
  }

  @Get(':id/entries')
  @ApiOperation({ summary: 'List a habit\'s entries', description: 'Defaults to the last 30 days.' })
  @ApiOkResponse({ type: [HabitEntryResponse] })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  listEntries(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Query() query: ListEntriesQueryDto) {
    return this.entries.list(user.id, id, { from: query.from, to: query.to });
  }

  @Post(':id/entries')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({
    summary: 'Check in for today, or a given date',
    description: 'Upserts by (habit, date): posting the same date again updates that entry instead of creating a second one.',
  })
  @ApiOkResponse({ type: HabitEntryResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  upsertEntry(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertEntryDto) {
    return this.entries.upsert(user.id, id, dto);
  }

  @Patch(':id/entries/:entryId')
  @ApiOperation({ summary: 'Update an entry' })
  @ApiOkResponse({ type: HabitEntryResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  updateEntry(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: UpdateEntryDto,
  ) {
    return this.entries.update(user.id, id, entryId, dto);
  }

  @Delete(':id/entries/:entryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an entry' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  async removeEntry(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Param('entryId', ParseUUIDPipe) entryId: string) {
    await this.entries.remove(user.id, id, entryId);
  }
}
