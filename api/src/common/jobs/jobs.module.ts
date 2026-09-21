import { Global, Module } from '@nestjs/common';
import { InProcessJobRunner, JobRunner } from './job-runner.js';

/** Provides the app-wide JobRunner; swap the binding here to move background work onto a real queue. */
@Global()
@Module({
  providers: [{ provide: JobRunner, useClass: InProcessJobRunner }],
  exports: [JobRunner],
})
export class JobsModule {}
