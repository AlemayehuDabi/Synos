import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseInterceptors } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { CreateProgramDto, ListProgramsQueryDto, UpdateProgramDto } from './dto/program.dto.js';
import { ProgramPageResponse, ProgramResponse } from './dto/responses.dto.js';
import { ProgramService } from './program.service.js';

@ApiTags('programs')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponse, description: 'Missing or invalid session/bearer token.' })
@Controller('programs')
export class ProgramsController {
  constructor(private readonly programs: ProgramService) {}

  @Get()
  @ApiOperation({ summary: 'List programs', description: 'Cursor-paginated, newest first.' })
  @ApiOkResponse({ type: ProgramPageResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  list(@CurrentUser() user: CurrentUserType, @Query() query: ListProgramsQueryDto) {
    return this.programs.list(user.id, { isActive: query.isActive }, { cursor: query.cursor, limit: query.limit });
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Replaying the same key returns the first successful response instead of acting again.' })
  @ApiOperation({ summary: 'Create a program', description: 'Planned sessions can be included; a new program is not active until activated.' })
  @ApiCreatedResponse({ type: ProgramResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateProgramDto) {
    return this.programs.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one program, with its planned sessions' })
  @ApiOkResponse({ type: ProgramResponse })
  @ApiBadRequestResponse({ type: ErrorResponse, description: '`id` is not a UUID.' })
  @ApiNotFoundResponse({ type: ErrorResponse })
  get(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.programs.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a program', description: 'Sending `workouts` replaces every planned session.' })
  @ApiOkResponse({ type: ProgramResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  update(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProgramDto) {
    return this.programs.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a program', description: 'Workouts already logged against it are kept, unlinked.' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  async remove(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    await this.programs.remove(user.id, id);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a program', description: 'Deactivates any other active program and starts this one\'s day zero now. Idempotent.' })
  @ApiOkResponse({ type: ProgramResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  activate(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.programs.activate(user.id, id);
  }
}
