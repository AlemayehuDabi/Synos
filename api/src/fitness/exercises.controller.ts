import { Body, Controller, Get, Post, Query, UseInterceptors } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, type CurrentUserType } from '../common/decorators/current-user.decorator.js';
import { IdempotencyInterceptor } from '../common/idempotency/idempotency.interceptor.js';
import { ErrorResponse } from '../signal-engine/dto/responses.dto.js';
import { CreateExerciseDto, ListExercisesQueryDto } from './dto/exercise.dto.js';
import { ExercisePageResponse, ExerciseResponse } from './dto/responses.dto.js';
import { ExerciseService } from './exercise.service.js';

@ApiTags('exercises')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponse, description: 'Missing or invalid session/bearer token.' })
@Controller('exercises')
export class ExercisesController {
  constructor(private readonly exercises: ExerciseService) {}

  @Get()
  @ApiOperation({ summary: 'List the exercise library plus your own custom exercises', description: 'Cursor-paginated, by name.' })
  @ApiOkResponse({ type: ExercisePageResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  list(@CurrentUser() user: CurrentUserType, @Query() query: ListExercisesQueryDto) {
    return this.exercises.list(
      user.id,
      { category: query.category, muscleGroup: query.muscleGroup, q: query.q, isCustom: query.isCustom },
      { cursor: query.cursor, limit: query.limit },
    );
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Replaying the same key returns the first successful response instead of acting again.' })
  @ApiOperation({ summary: 'Add a custom exercise' })
  @ApiCreatedResponse({ type: ExerciseResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiConflictResponse({ type: ErrorResponse, description: 'You already have a custom exercise with this name.' })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateExerciseDto) {
    return this.exercises.create(user.id, dto);
  }
}
