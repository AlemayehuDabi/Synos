import { Module, type OnModuleDestroy } from '@nestjs/common';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';
import { auth, authPrisma } from '../../lib/auth.js';
import { UserLifecycleHook } from './user-lifecycle.hook.js';

@Module({
  imports: [BetterAuthModule.forRoot({ auth })],
  providers: [UserLifecycleHook],
})
export class AuthModule implements OnModuleDestroy {
  // lib/auth.ts's PrismaClient is a plain singleton outside Nest's DI (the
  // Better Auth CLI imports it directly too), so nothing else disconnects it.
  async onModuleDestroy(): Promise<void> {
    await authPrisma.$disconnect();
  }
}
