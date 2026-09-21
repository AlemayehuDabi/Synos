import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule, ObserveInstrument } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // The Better Auth Nest integration re-adds body parsers for non-auth routes
    // itself; letting Nest parse the body too would consume Better Auth's raw
    // request stream before it gets a chance to read it.
    bodyParser: false,
    instrument: ObserveInstrument,
  });

  const configService = app.get(ConfigService);

  app.use(helmet());

  const corsOrigins = configService
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  // Better Auth's own routes live at /api/auth/* and must stay outside our
  // versioned prefix; /healthz is unprefixed for liveness/readiness probes.
  app.setGlobalPrefix('api/v1', {
    exclude: ['api/auth', 'api/auth/*path', 'healthz', 'healthz/ready'],
  });

  if (configService.get('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Synos API')
      .setDescription('Auth & account management endpoints')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(configService.get<number>('PORT', 3000));
}
await bootstrap();
