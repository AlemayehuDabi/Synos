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
import { WorkoutPageResponse, WorkoutResponse } from './dto/responses.dto.js';
import { CompleteWorkoutDto, CreateWorkoutDto, ListWorkoutsQueryDto, UpdateWorkoutDto } from './dto/workout.dto.js';
import { WorkoutService } from './workout.service.js';

const IDEMPOTENCY_HEADER = {
  name: 'Idempotency-Key',
  required: false,
  description: 'Replaying the same key returns the first successful response instead of acting again.',
} as const;

@ApiTags('workouts')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponse, description: 'Missing or invalid session/bearer token.' })
@Controller('workouts')
export class WorkoutsController {
  constructor(private readonly workouts: WorkoutService) {}

  @Get()
  @ApiOperation({ summary: 'List workouts', description: 'Cursor-paginated, most recently started first.' })
  @ApiOkResponse({ type: WorkoutPageResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  list(@CurrentUser() user: CurrentUserType, @Query() query: ListWorkoutsQueryDto) {
    return this.workouts.list(
      user.id,
      { from: query.from, to: query.to, workoutType: query.workoutType, completed: query.completed },
      { cursor: query.cursor, limit: query.limit },
    );
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({ summary: 'Log a workout', description: 'Exercises and their sets can be nested in the same call.' })
  @ApiCreatedResponse({ type: WorkoutResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiConflictResponse({ type: ErrorResponse, description: 'The client-supplied `id` already exists.' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateWorkoutDto) {
    return this.workouts.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one workout, with its exercises and sets' })
  @ApiOkResponse({ type: WorkoutResponse })
  @ApiBadRequestResponse({ type: ErrorResponse, description: '`id` is not a UUID.' })
  @ApiNotFoundResponse({ type: ErrorResponse })
  get(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.workouts.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a workout', description: 'Sending `exercises` replaces every exercise and set of the workout.' })
  @ApiOkResponse({ type: WorkoutResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  update(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkoutDto) {
    return this.workouts.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a workout' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  async remove(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    await this.workouts.remove(user.id, id);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({
    summary: 'Complete a workout',
    description: 'Sets `completedAt` (default now) and emits the `workout.completed` signal.',
  })
  @ApiOkResponse({ type: WorkoutResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiConflictResponse({ type: ErrorResponse, description: 'The workout is already completed.' })
  @ApiNotFoundResponse({ type: ErrorResponse })
  complete(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteWorkoutDto) {
    return this.workouts.complete(user.id, id, dto);
  }
}
