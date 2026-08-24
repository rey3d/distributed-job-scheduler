import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { claimNextJob, transitionJobState, JobStatus, prisma } from '@job-scheduler/shared';

describe('Batch Job Creation & Progress REST API Integration Tests', () => {
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
        email: `batch.user.${Date.now()}@acme.com`,
        password: 'password123',
        organizationName: 'Batch Processing Enterprise',
      });

    token = regRes.body.accessToken;
    orgId = regRes.body.organization.id;

    // 2. Create Project
    const projRes = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Batch Processing Project',
      });

    projectId = projRes.body.id;

    // 3. Create Queue
    const queueRes = await request(app.getHttpServer())
      .post(`/projects/${projectId}/queues`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'batch-processing-queue',
        concurrencyLimit: 10,
      });

    queueId = queueRes.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects empty batch submission with 400 Bad Request', async () => {
    const res = await request(app.getHttpServer())
      .post(`/queues/${queueId}/jobs/batch`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        jobs: [],
      });

    expect(res.status).toBe(400);
  });

  it('rejects batch submission exceeding 500 jobs limit with 400 Bad Request', async () => {
    const oversizedJobs = Array.from({ length: 501 }, (_, i) => ({
      type: 'email.send',
      payload: { index: i },
    }));

    const res = await request(app.getHttpServer())
      .post(`/queues/${queueId}/jobs/batch`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        jobs: oversizedJobs,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Batch size exceeds maximum limit of 500 jobs');
  });

  it('creates a batch of 5 jobs linked by batchId and tracks progress live', async () => {
    const batchJobs = [
      { type: 'email.send', payload: { recipient: 'user1@acme.com' }, priority: 10 },
      { type: 'email.send', payload: { recipient: 'user2@acme.com' }, priority: 10 },
      { type: 'billing.charge', payload: { amount: 49.99 }, priority: 5 },
      { type: 'billing.charge', payload: { amount: 99.99 }, priority: 5 },
      { type: 'data.process', payload: { file: 'data.csv' }, priority: 1 },
    ];

    // 1. Submit Batch POST /queues/:id/jobs/batch
    const createRes = await request(app.getHttpServer())
      .post(`/queues/${queueId}/jobs/batch`)
      .set('Authorization', `Bearer ${token}`)
      .send({ jobs: batchJobs });

    expect(createRes.status).toBe(201);
    expect(createRes.body.batchId).toBeDefined();
    expect(createRes.body.totalJobs).toBe(5);
    expect(createRes.body.createdJobsCount).toBe(5);

    const batchId = createRes.body.batchId;

    // 2. Query Batch Progress GET /batches/:id
    const progressRes1 = await request(app.getHttpServer())
      .get(`/batches/${batchId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(progressRes1.status).toBe(200);
    expect(progressRes1.body.id).toBe(batchId);
    expect(progressRes1.body.totalJobs).toBe(5);
    expect(progressRes1.body.counts.QUEUED).toBe(5);
    expect(progressRes1.body.counts.COMPLETED).toBe(0);

    // 3. Claim and Complete 2 jobs
    const worker = await prisma.worker.create({
      data: { name: `batch-worker-${Date.now()}`, hostname: 'localhost', processId: process.pid },
    });

    const claimed1 = await claimNextJob(queueId, worker.id);
    const claimed2 = await claimNextJob(queueId, worker.id);

    expect(claimed1).not.toBeNull();
    expect(claimed2).not.toBeNull();

    await transitionJobState(claimed1!.id, JobStatus.RUNNING, worker.id);
    await transitionJobState(claimed1!.id, JobStatus.COMPLETED, worker.id);

    await transitionJobState(claimed2!.id, JobStatus.RUNNING, worker.id);
    await transitionJobState(claimed2!.id, JobStatus.COMPLETED, worker.id);

    // 4. Query Batch Progress again to verify live status updates
    const progressRes2 = await request(app.getHttpServer())
      .get(`/batches/${batchId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(progressRes2.status).toBe(200);
    expect(progressRes2.body.counts.QUEUED).toBe(3);
    expect(progressRes2.body.counts.COMPLETED).toBe(2);
  });
});
