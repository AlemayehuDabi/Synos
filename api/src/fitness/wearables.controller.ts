import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CurrentUser, type CurrentUserType } from '../common/decorators/current-user.decorator.js';
import { IdempotencyInterceptor } from '../common/idempotency/idempotency.interceptor.js';
import { ErrorResponse } from '../signal-engine/dto/responses.dto.js';
import { IngestSamplesResponse, SleepResponse } from './dto/responses.dto.js';
import { IngestSamplesDto, SleepQueryDto } from './dto/wearable.dto.js';
import { WearableService } from './wearable.service.js';

@ApiTags('wearables')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponse, description: 'Missing or invalid session/bearer token.' })
@Controller('wearables')
export class WearablesController {
  constructor(private readonly wearables: WearableService) {}

  @Post('samples')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Replaying the same key returns the first successful response instead of acting again.' })
  @ApiOperation({
    summary: 'Ingest a batch of wearable samples',
    description:
      'Deduplicated by `dedupeKey` per user. Samples are stored on their own and never change a manual workout; a `workout` sample that overlaps a manual workout but disagrees with it is flagged as a conflict.',
  })
  @ApiOkResponse({ type: IngestSamplesResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  ingest(@CurrentUser() user: CurrentUserType, @Body() dto: IngestSamplesDto) {
    return this.wearables.ingest(user.id, dto);
  }

  @Get('sleep')
  @ApiOperation({
    summary: 'Nightly sleep totals',
    description: 'One entry per wake-up date with sleep data, flagged `poor` when under FITNESS_SLEEP_POOR_THRESHOLD_MIN - the input the sleep.poor detector evaluates.',
  })
  @ApiOkResponse({ type: SleepResponse })
  @ApiBadRequestResponse({ type: ErrorResponse })
  sleep(@CurrentUser() user: CurrentUserType, @Query() query: SleepQueryDto) {
    return this.wearables.sleep(user.id, { from: query.from, to: query.to });
  }
}
