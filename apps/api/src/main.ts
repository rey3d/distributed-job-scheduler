import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = process.env.CORS_ORIGIN
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV === 'production' && !allowedOrigins?.length) {
    throw new Error('CORS_ORIGIN must be configured when NODE_ENV=production');
  }

  app.enableCors({
    origin: allowedOrigins?.length ? allowedOrigins : true,
    credentials: true,
  });

  // Global DTO Validation & Transformation
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    })
  );

  // OpenAPI / Swagger Documentation Setup
  const config = new DocumentBuilder()
    .setTitle('Distributed Job Scheduling Platform API')
    .setDescription(
      'Multi-tenant REST API for managing organizations, projects, job queues, executions, retry policies, and monitoring.'
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('Authentication', 'User registration and JWT authentication')
    .addTag('Organizations', 'Tenant boundaries and management')
    .addTag('Projects', 'Project containers belonging to organizations')
    .addTag('Queues', 'Job queue configuration, priority, and pause/resume controls')
    .addTag('Jobs', 'Job enqueuing, scheduling, inspection, DLQ retry, and cancellation')
    .addTag('Workers & Monitoring', 'Worker fleet status, DLQ entries, and aggregated dashboard metrics')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 NestJS API Service running on http://localhost:${port}`);
  console.log(`📚 OpenAPI/Swagger Docs available at http://localhost:${port}/api/docs`);
}

bootstrap();
