import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { prisma, JobStatus } from '@job-scheduler/shared';

describe('Throughput Chart Endpoint Integration Tests', () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let projectId: string;
  let queueId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
      })
    );
    await app.init();

    // 1. Register tenant
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `chart.user.${Date.now()}@acme.com`,
        password: 'password123',
        organizationName: 'Throughput Chart Enterprise',
      });

    token = regRes.body.accessToken;
    orgId = regRes.body.organization.id;

    // 2. Create Project
    const projRes = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Throughput Chart Project',
      });

    projectId = projRes.body.id;

    // 3. Create Queue
    const queueRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/queues`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'chart-queue',
        concurrencyLimit: 10,
      });

    queueId = queueRes.body.id;

    // 4. Seed completed jobs
    const now = new Date();
    await prisma.job.create({
      data: {
        queueId,
        type: 'email.send',
        payload: { recipient: 'user@acme.com' },
        status: JobStatus.COMPLETED,
        finishedAt: now,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /projects/:id/throughput-chart returns 200 OK with cast UUID query results', async () => {
    const res = await request(app.getHttpServer())
      .get(`/projects/${projectId}/throughput-chart?hours=6`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.hours).toBe(6);
    expect(res.body.intervalMinutes).toBe(15);
    expect(Array.isArray(res.body.buckets)).toBe(true);
    expect(res.body.buckets.length).toBeGreaterThan(0);
    expect(res.body.buckets[0].completedCount).toBeGreaterThanOrEqual(1);
  });
});
