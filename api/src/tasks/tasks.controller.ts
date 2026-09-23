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
  Put,
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
import { CompleteTaskDto } from './dto/complete-task.dto.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { DeleteTaskQueryDto } from './dto/delete-task-query.dto.js';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto.js';
import { ReorderTasksDto } from './dto/reorder-tasks.dto.js';
import { ScheduleTaskDto } from './dto/schedule-task.dto.js';
import { SkipTaskDto } from './dto/skip-task.dto.js';
import { CreateSubtaskDto, UpdateSubtaskDto } from './dto/subtask.dto.js';
import { UpdateRecurrenceDto } from './dto/update-recurrence.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { SubtaskResponse, TaskOccurrenceResponse, TaskPageResponse, TaskResponse } from './dto/responses.dto.js';
import { SubtaskService } from './subtask.service.js';
import { TaskService } from './task.service.js';

const IDEMPOTENCY_HEADER = {
  name: 'Idempotency-Key',
  required: false,
  description: 'Replaying the same key returns the first successful response instead of acting again.',
} as const;

@ApiTags('tasks')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponse, description: 'Missing or invalid session/bearer token.' })
@ApiExtraModels(TaskOccurrenceResponse)
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasks: TaskService,
    private readonly subtasks: SubtaskService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tasks', description: 'Cursor-paginated in the caller\'s own sortOrder.' })
  @ApiOkResponse({ type: TaskPageResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  list(@CurrentUser() user: CurrentUserType, @Query() query: ListTasksQueryDto) {
    return this.tasks.list(
      user.id,
      {
        status: query.status,
        priority: query.priority,
        dueBefore: query.dueBefore,
        dueAfter: query.dueAfter,
        recurringGroupId: query.recurringGroupId,
        unscheduled: query.unscheduled,
      },
      { cursor: query.cursor, limit: query.limit },
    );
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({ summary: 'Create a task', description: 'Quick capture: only `title` is required.' })
  @ApiCreatedResponse({ type: TaskResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiConflictResponse({ type: ErrorResponse, description: 'The client-supplied `id` already exists.' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user.id, dto);
  }

  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recompute sortOrder for the given tasks, in the given order' })
  @ApiOkResponse({ description: 'No content.' })
  @ApiBadRequestResponse({ type: ErrorResponse })
  async reorder(@CurrentUser() user: CurrentUserType, @Body() dto: ReorderTasksDto) {
    await this.tasks.reorder(user.id, dto.orderedIds);
    return {};
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one task (master record, not expanded)' })
  @ApiOkResponse({ type: TaskResponse })
  @ApiBadRequestResponse({ type: ErrorResponse, description: '`id` is not a UUID.' })
  @ApiNotFoundResponse({ type: ErrorResponse })
  get(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a task or one of its occurrences',
    description:
      '`scope` ("this" | "following" | "all", default "all") controls how far the change reaches on a recurring task; ' +
      '"this" and "following" require `occurrenceStart` (that occurrence\'s unmodified due date). Returns the occurrence when scope is "this", the task otherwise.',
  })
  @ApiOkResponse({ schema: { oneOf: [{ $ref: '#/components/schemas/TaskResponse' }, { $ref: '#/components/schemas/TaskOccurrenceResponse' }] } })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  update(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a task or one of its occurrences',
    description: 'Same `scope`/`occurrenceStart` as PATCH. "this" skips one occurrence; "following" truncates the series; "all" (default) deletes the whole thing.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  async remove(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Query() query: DeleteTaskQueryDto) {
    await this.tasks.remove(user.id, id, query.scope ?? 'all', query.occurrenceStart);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({
    summary: 'Complete the task\'s current occurrence',
    description:
      'For a recurring task this rolls `dueAt` forward to the next occurrence and the task stays open; otherwise (or once the series ends) the task itself becomes completed. ' +
      '`actualMinutes`, if given, feeds the adaptive estimate.',
  })
  @ApiOkResponse({ type: TaskResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiConflictResponse({ type: ErrorResponse, description: 'The task is not open.' })
  @ApiNotFoundResponse({ type: ErrorResponse })
  complete(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteTaskDto) {
    return this.tasks.complete(user.id, id, dto);
  }

  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reopen a completed task' })
  @ApiOkResponse({ type: TaskResponse })
  @ApiConflictResponse({ type: ErrorResponse, description: 'The task is not completed.' })
  @ApiNotFoundResponse({ type: ErrorResponse })
  reopen(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.reopen(user.id, id);
  }

  @Post(':id/skip')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({
    summary: 'Skip one occurrence of a recurring task',
    description: 'Creates a `skipped` exception. Defaults to the task\'s own current dueAt, which also rolls `dueAt` forward to the next occurrence.',
  })
  @ApiOkResponse({ type: TaskResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  skip(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SkipTaskDto) {
    return this.tasks.skip(user.id, id, dto);
  }

  @Put(':id/recurrence')
  @ApiOperation({ summary: 'Change or remove a task\'s recurrence', description: 'Same scope semantics as PATCH.' })
  @ApiOkResponse({ schema: { oneOf: [{ $ref: '#/components/schemas/TaskResponse' }, { $ref: '#/components/schemas/TaskOccurrenceResponse' }] } })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  updateRecurrence(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRecurrenceDto) {
    return this.tasks.updateRecurrence(user.id, id, dto);
  }

  @Post(':id/schedule')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({ summary: 'Schedule (or unschedule) a task', description: 'Clearing is `scheduledStart: null`.' })
  @ApiOkResponse({ type: TaskResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  schedule(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ScheduleTaskDto) {
    return this.tasks.schedule(user.id, id, dto);
  }

  @Get(':id/subtasks')
  @ApiOperation({ summary: 'List a task\'s subtasks' })
  @ApiOkResponse({ type: [SubtaskResponse] })
  @ApiNotFoundResponse({ type: ErrorResponse })
  listSubtasks(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.subtasks.list(user.id, id);
  }

  @Post(':id/subtasks')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({ summary: 'Add a subtask' })
  @ApiCreatedResponse({ type: SubtaskResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  createSubtask(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateSubtaskDto) {
    return this.subtasks.create(user.id, id, dto);
  }

  @Patch(':id/subtasks/:subtaskId')
  @ApiOperation({ summary: 'Update a subtask' })
  @ApiOkResponse({ type: SubtaskResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  updateSubtask(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('subtaskId', ParseUUIDPipe) subtaskId: string,
    @Body() dto: UpdateSubtaskDto,
  ) {
    return this.subtasks.update(user.id, id, subtaskId, dto);
  }

  @Delete(':id/subtasks/:subtaskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a subtask' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  async removeSubtask(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Param('subtaskId', ParseUUIDPipe) subtaskId: string) {
    await this.subtasks.remove(user.id, id, subtaskId);
  }
}
