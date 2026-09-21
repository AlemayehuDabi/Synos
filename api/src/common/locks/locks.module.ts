import { Global, Module } from '@nestjs/common';
import { AdvisoryLockService } from './advisory-lock.service.js';

@Global()
@Module({
  providers: [AdvisoryLockService],
  exports: [AdvisoryLockService],
})
export class LocksModule {}
