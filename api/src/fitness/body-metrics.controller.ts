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
import { CreateBodyMetricDto, ListBodyMetricsQueryDto, UpdateBodyMetricDto } from './dto/body-metric.dto.js';
import { BodyMetricPageResponse, BodyMetricResponse } from './dto/responses.dto.js';
import { BodyMetricService } from './body-metric.service.js';

@ApiTags('body-metrics')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponse, description: 'Missing or invalid session/bearer token.' })
@Controller('body-metrics')
export class BodyMetricsController {
  constructor(private readonly metrics: BodyMetricService) {}

  @Get()
  @ApiOperation({ summary: 'List body metrics', description: 'Cursor-paginated, newest date first.' })
  @ApiOkResponse({ type: BodyMetricPageResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  list(@CurrentUser() user: CurrentUserType, @Query() query: ListBodyMetricsQueryDto) {
    return this.metrics.list(user.id, { from: query.from, to: query.to }, { cursor: query.cursor, limit: query.limit });
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Replaying the same key returns the first successful response instead of acting again.' })
  @ApiOperation({ summary: 'Record a body metric', description: 'At least one of weightKg, bodyFatPct or notes is required.' })
  @ApiCreatedResponse({ type: BodyMetricResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateBodyMetricDto) {
    return this.metrics.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a body metric' })
  @ApiOkResponse({ type: BodyMetricResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  update(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBodyMetricDto) {
    return this.metrics.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a body metric' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponse })
  @ApiNotFoundResponse({ type: ErrorResponse })
  async remove(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    await this.metrics.remove(user.id, id);
  }
}
