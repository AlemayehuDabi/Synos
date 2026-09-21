import { Module } from '@nestjs/common';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from '../../lib/auth.js';
import { UserLifecycleHook } from './user-lifecycle.hook.js';

@Module({
  imports: [BetterAuthModule.forRoot({ auth })],
  providers: [UserLifecycleHook],
})
export class AuthModule {}
