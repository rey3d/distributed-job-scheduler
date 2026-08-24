import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { prisma, JobStatus, ExecutionStatus, DLQStatus } from '@job-scheduler/shared';

describe('Per-Queue Statistics REST API Integration Tests', () => {
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
        email: `stats.user.${Date.now()}@acme.com`,
        password: 'password123',
        organizationName: 'Stats Test Enterprise',
      });

    token = regRes.body.accessToken;
    orgId = regRes.body.organization.id;

    // 2. Create Project
    const projRes = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Stats Test Project',
      });

    projectId = projRes.body.id;

    // 3. Create Queue
    const queueRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/queues`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'metrics-queue',
        concurrencyLimit: 10,
      });

    queueId = queueRes.body.id;

    // 4. Seed known dataset: 2 COMPLETED jobs, 1 FAILED job, 1 DLQ entry
    const now = new Date();

    // Job 1 (Completed 200ms)
    const job1 = await prisma.job.create({
      data: {
        queueId,
        type: 'email.send',
        payload: { recipient: 'user1@acme.com' },
        status: JobStatus.COMPLETED,
        finishedAt: now,
      },
    });

    await prisma.jobExecution.create({
      data: {
        jobId: job1.id,
        attempt: 1,
        status: ExecutionStatus.SUCCESS,
        startedAt: new Date(now.getTime() - 200),
        finishedAt: now,
        durationMs: 200,
      },
    });

    // Job 2 (Completed 400ms)
    const job2 = await prisma.job.create({
      data: {
        queueId,
        type: 'email.send',
        payload: { recipient: 'user2@acme.com' },
        status: JobStatus.COMPLETED,
        finishedAt: now,
      },
    });

    await prisma.jobExecution.create({
      data: {
        jobId: job2.id,
        attempt: 1,
        status: ExecutionStatus.SUCCESS,
        startedAt: new Date(now.getTime() - 400),
        finishedAt: now,
        durationMs: 400,
      },
    });

    // Job 3 (Failed)
    const job3 = await prisma.job.create({
      data: {
        queueId,
        type: 'payment.process',
        payload: { amount: 100 },
        status: JobStatus.FAILED,
        finishedAt: now,
      },
    });

    await prisma.jobExecution.create({
      data: {
        jobId: job3.id,
        attempt: 1,
        status: ExecutionStatus.FAILED,
        startedAt: new Date(now.getTime() - 150),
        finishedAt: now,
        durationMs: 150,
      },
    });

    // DLQ Entry for Job 3
    await prisma.deadLetterJob.create({
      data: {
        originalJobId: job3.id,
        queueId,
        failedAt: now,
        lastError: { message: 'Card declined' },
        totalAttempts: 3,
        payload: job3.payload,
        status: DLQStatus.UNRESOLVED,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /queues/:id/stats returns accurate aggregate metrics matching seeded dataset', async () => {
    const res = await request(app.getHttpServer())
      .get(`/queues/${queueId}/stats`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.queueId).toBe(queueId);
    expect(res.body.jobsCompleted24h).toBe(2);
    expect(res.body.jobsFailed24h).toBe(1);
    expect(res.body.successRate).toBe(66.7); // 2 / 3 = 66.7%
    expect(res.body.avgDurationMs).toBe(300); // (200 + 400) / 2 = 300ms
    expect(res.body.dlqCount).toBe(1);
  });
});
