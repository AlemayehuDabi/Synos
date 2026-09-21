import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { auth } from '../../lib/auth.js';

export type CurrentUserType = UserSession<typeof auth>['user'];

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserType => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
