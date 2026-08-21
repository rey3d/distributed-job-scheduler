import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { prisma, DLQStatus, JobStatus } from '@job-scheduler/shared';

describe('NestJS REST API Integration Test Suite (Supertest)', () => {
  let app: INestApplication;

  let tokenA: string;
  let orgAId: string;
  let userAId: string;

  let tokenB: string;
  let orgBId: string;
  let userBId: string;

  let projectAId: string;
  let queueAId: string;
  let jobIdA: string;

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

    // 1. Setup Tenant A
    const resA = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `tenant.a.${Date.now()}@acme.com`,
        password: 'password123',
        organizationName: 'Tenant Alpha Corp',
      });
    tokenA = resA.body.accessToken;
    orgAId = resA.body.organization.id;
    userAId = resA.body.user.id;

    // 2. Setup Tenant B
    const resB = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `tenant.b.${Date.now()}@beta.com`,
        password: 'password123',
        organizationName: 'Tenant Beta Corp',
      });
    tokenB = resB.body.accessToken;
    orgBId = resB.body.organization.id;
    userBId = resB.body.user.id;

    // 3. Setup Project A under Org A
    const projRes = await request(app.getHttpServer())
      .post(`/organizations/${orgAId}/projects`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Payment Core Service' });
    projectAId = projRes.body.id;

    // 4. Setup Queue A under Project A
    const queueRes = await request(app.getHttpServer())
      .post(`/projects/${projectAId}/queues`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'email-notifications',
        concurrencyLimit: 10,
        retryPolicy: {
          strategy: 'EXPONENTIAL',
          baseDelaySec: 5,
          maxAttempts: 3,
        },
      });
    queueAId = queueRes.body.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // 1. Auth Flow Tests
  // ---------------------------------------------------------------------------
  describe('Authentication Endpoints', () => {
    it('allows a user to log in with valid credentials', async () => {
      const email = `login.user.${Date.now()}@acme.com`;
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email,
          password: 'password123',
          organizationName: 'Login Test Corp',
        })
        .expect(201);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email,
          password: 'password123',
        })
        .expect(200);

      expect(loginRes.body).toHaveProperty('accessToken');
    });

    it('rejects login with invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@acme.com',
          password: 'wrongpassword',
        })
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Tenant Boundary & Security Isolation
  // ---------------------------------------------------------------------------
  describe('Tenant Boundary & Security Isolation', () => {
    it('blocks User B (Org B) from accessing User A (Org A) Project details', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404); // Scoped database lookup returns 404
    });

    it('blocks User B (Org B) from accessing User A (Org A) Queue details', async () => {
      await request(app.getHttpServer())
        .get(`/queues/${queueAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('blocks unauthenticated requests without JWT token', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${projectAId}`)
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Job Enqueuing & Inspection
  // ---------------------------------------------------------------------------
  describe('Job Lifecycle via API', () => {
    it('enqueues an immediate job via POST /queues/:id/jobs', async () => {
      const res = await request(app.getHttpServer())
        .post(`/queues/${queueAId}/jobs`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          type: 'email.send',
          payload: { recipient: 'john@acme.com', template: 'welcome' },
          priority: 5,
          idempotencyKey: `idempotent-test-${Date.now()}`,
        })
        .expect(201);

      expect(res.body).toHaveProperty('job');
      expect(res.body.duplicate).toBe(false);
      jobIdA = res.body.job.id;
    });

    it('inspects full job details via GET /jobs/:id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/jobs/${jobIdA}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.id).toBe(jobIdA);
      expect(res.body.status).toBe('QUEUED');
      expect(res.body.type).toBe('email.send');
      expect(Array.isArray(res.body.executions)).toBe(true);
      expect(Array.isArray(res.body.logs)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Dead Letter Queue Manual Retry Endpoint
  // ---------------------------------------------------------------------------
  describe('Dead Letter Queue Manual Retry', () => {
    it('manually retries a job from the Dead Letter Queue via POST /jobs/:id/retry', async () => {
      // Seed a failed job and corresponding DLQ entry in Queue A
      const job = await prisma.job.create({
        data: {
          queueId: queueAId,
          type: 'billing.charge',
          payload: { amount: 100 },
          status: JobStatus.FAILED,
          attemptCount: 3,
          maxAttempts: 3,
        },
      });

      await prisma.deadLetterJob.create({
        data: {
          originalJobId: job.id,
          queueId: queueAId,
          lastError: { message: 'Credit card declined' },
          totalAttempts: 3,
          payload: job.payload,
          status: DLQStatus.UNRESOLVED,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/jobs/${job.id}/retry`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.id).toBe(job.id);
      expect(res.body.status).toBe('QUEUED');
      expect(res.body.attemptCount).toBe(0);

      // Verify DLQ entry status in database was updated to RETRIED
      const dlq = await prisma.deadLetterJob.findUnique({
        where: { originalJobId: job.id },
      });
      expect(dlq?.status).toBe('RETRIED');
    });
  });
});
