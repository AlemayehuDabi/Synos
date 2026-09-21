import { BadRequestException, Body, Controller, Delete, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { CurrentUser, type CurrentUserType } from '../../common/decorators/current-user.decorator.js';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor.js';
import { DevicesService } from './devices.service.js';
import { RegisterDeviceDto } from './dto/register-device.dto.js';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  register(@CurrentUser() user: CurrentUserType, @Body() dto: RegisterDeviceDto) {
    return this.devicesService.upsertByToken(user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.devicesService.removeOwned(user.id, id);
  }

  @Delete()
  removeByToken(@CurrentUser() user: CurrentUserType, @Query('token') token?: string) {
    if (!token) {
      throw new BadRequestException('token query parameter is required');
    }
    return this.devicesService.removeByTokenOwned(user.id, token);
  }
}
