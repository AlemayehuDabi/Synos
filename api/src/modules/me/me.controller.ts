import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { CurrentUser, type CurrentUserType } from '../../common/decorators/current-user.decorator.js';
import type { Auth } from '../../lib/auth.js';
import { MeService } from './me.service.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';

@Controller('me')
export class MeController {
  constructor(
    private readonly meService: MeService,
    private readonly accountDeletionService: AccountDeletionService,
  ) {}

  @Get()
  getProfile(@CurrentUser() user: CurrentUserType) {
    return this.meService.getProfile(user.id);
  }

  @Patch()
  updateProfile(@CurrentUser() user: CurrentUserType, @Body() dto: UpdateMeDto) {
    return this.meService.updateProfile(user.id, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@Session() session: UserSession<Auth>, @Body() dto: DeleteAccountDto, @Req() req: Request) {
    await this.accountDeletionService.deleteAccount({
      userId: session.user.id,
      password: dto.password,
      sessionCreatedAt: new Date(session.session.createdAt),
      headers: req.headers,
    });
  }
}
