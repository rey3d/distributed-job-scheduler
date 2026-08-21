import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { claimNextJob, transitionJobState, JobStatus, prisma } from '@job-scheduler/shared';

describe('Full-Stack End-to-End Integration Flow (API -> Worker -> API)', () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let projectId: string;
  let queueId: string;
  let jobId: string;

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

    // 1. Register new Tenant
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `e2e.user.${Date.now()}@scheduler.io`,
        password: 'password123',
        organizationName: 'E2E Test Enterprise',
      });

    expect(regRes.status).toBe(201);
    token = regRes.body.accessToken;
    orgId = regRes.body.organization.id;

    // 2. Create Project via REST API
    const projRes = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'E2E Core Project',
      });

    expect(projRes.status).toBe(201);
    projectId = projRes.body.id;

    // 3. Create Queue via REST API
    const queueRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/queues`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'e2e-notification-queue',
        priority: 10,
        concurrencyLimit: 5,
      });

    expect(queueRes.status).toBe(201);
    queueId = queueRes.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('executes full job lifecycle: API Enqueue -> Worker Atomic Claim & Execution -> API Status Verification', async () => {
    // Step 1: Enqueue Job via REST API
    const enqueueRes = await request(app.getHttpServer())
      .post(`/queues/${queueId}/jobs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'email.send',
        payload: { recipient: 'e2e-client@enterprise.com', templateId: 'welcome-email' },
        priority: 5,
      });

    expect(enqueueRes.status).toBe(201);
    expect(enqueueRes.body.job).toBeDefined();
    expect(enqueueRes.body.job.id).toBeDefined();
    expect(enqueueRes.body.job.status).toBe('QUEUED');
    jobId = enqueueRes.body.job.id;

    // Step 2: Worker Atomic Claim & Execution
    const worker = await prisma.worker.create({
      data: {
        name: `e2e-worker-${Date.now()}`,
        hostname: 'localhost',
        processId: process.pid,
      },
    });
    const workerId = worker.id;

    const claimedJob = await claimNextJob(queueId, workerId);

    expect(claimedJob).not.toBeNull();
    expect(claimedJob?.id).toBe(jobId);
    expect(claimedJob?.status).toBe('CLAIMED');

    // Simulate worker processing and completing the job
    await transitionJobState(jobId, JobStatus.RUNNING, workerId);
    await transitionJobState(jobId, JobStatus.COMPLETED, workerId);

    await prisma.jobExecution.create({
      data: {
        jobId,
        workerId,
        attempt: 1,
        status: 'SUCCESS',
        result: { sent: true, provider: 'smtp-relay', durationMs: 42 },
      },
    });

    // Step 3: Query Job Details via REST API to verify final state
    const jobRes = await request(app.getHttpServer())
      .get(`/jobs/${jobId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(jobRes.status).toBe(200);
    expect(jobRes.body.id).toBe(jobId);
    expect(jobRes.body.status).toBe('COMPLETED');
    expect(jobRes.body.executions).toBeDefined();
    expect(jobRes.body.executions[0].result).toEqual({ sent: true, provider: 'smtp-relay', durationMs: 42 });
    expect(jobRes.body.finishedAt).toBeDefined();
  });
});
