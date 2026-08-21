import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import * as fs from 'fs';
import * as path from 'path';

async function generateSwaggerJson() {
  const app = await NestFactory.create(AppModule, { logger: false });

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

  const outputPath = path.resolve(__dirname, '../../../docs/api-spec.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf-8');

  console.log(`✅ Exported static OpenAPI spec to: ${outputPath}`);
  await app.close();
}

generateSwaggerJson();
