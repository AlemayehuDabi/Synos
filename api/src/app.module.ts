import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { createObserveModule } from '@nestjs/observe';
import { ConfigModule } from './config/config.module.js';
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { MailModule } from './modules/mail/mail.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { MeModule } from './modules/me/me.module.js';
import { DevicesModule } from './modules/devices/devices.module.js';
import { SignalEngineModule } from './signal-engine/signal-engine.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { TodayModule } from './today/today.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { CalendarModule } from './calendar/calendar.module.js';
import { JobsModule } from './common/jobs/jobs.module.js';
import { LocksModule } from './common/locks/locks.module.js';
import { HealthController } from './common/health/health.controller.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule,
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'api',
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    PrismaModule,
    JobsModule,
    LocksModule,
    MailModule,
    AuthModule,
    MeModule,
    DevicesModule,
    SignalEngineModule,
    NotificationsModule,
    TodayModule,
    ReviewsModule,
    CalendarModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
