import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser, type CurrentUserType } from '../../common/decorators/current-user.decorator.js';
import { SettingsService } from './settings.service.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';

@Controller('me/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get(@CurrentUser() user: CurrentUserType) {
    return this.settingsService.get(user.id);
  }

  @Patch()
  update(@CurrentUser() user: CurrentUserType, @Body() dto: UpdateSettingsDto) {
    return this.settingsService.update(user.id, dto);
  }
}
