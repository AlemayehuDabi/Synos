import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser, type CurrentUserType } from '../../common/decorators/current-user.decorator.js';
import { PrivacyService } from './privacy.service.js';
import { UpdatePrivacyDto } from './dto/update-privacy.dto.js';

@Controller('me/privacy')
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  @Get()
  get(@CurrentUser() user: CurrentUserType) {
    return this.privacyService.get(user.id);
  }

  @Patch()
  update(@CurrentUser() user: CurrentUserType, @Body() dto: UpdatePrivacyDto) {
    return this.privacyService.update(user.id, dto);
  }
}
