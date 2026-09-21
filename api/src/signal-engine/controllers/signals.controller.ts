import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CurrentUserType } from '../../common/decorators/current-user.decorator.js';
import { ListSignalsQueryDto } from '../dto/list-signals-query.dto.js';
import { SignalsService } from '../services/signals.service.js';

@ApiTags('signals')
@Controller('signals')
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserType, @Query() query: ListSignalsQueryDto) {
    return this.signalsService.list(
      user.id,
      {
        domain: query.domain,
        type: query.type,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      },
      { cursor: query.cursor, limit: query.limit },
    );
  }
}
