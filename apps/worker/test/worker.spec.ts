import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, JobStatus, RetryStrategy, DLQStatus } from '@job-scheduler/shared';
import { registerWorkerNode, updateWorkerStatus, deregisterWorkerNode } from '../src/identity';
import { JobHandlerRegistry, defaultRegistry, UnknownJobTypeError } from '../src/handlers/registry';
import { processClaimedJob } from '../src/runner';
import { WorkerPoller } from '../src/poller';

describe('Worker Service Component & Integration Tests', () => {
  let workerId: string;
  let queueId: string;

  beforeAll(async () => {
    // Setup test queue
    const org = await prisma.organization.create({
      data: {
        name: `Worker Test Org ${Date.now()}`,
        slug: `worker-test-org-${Date.now()}`,
      },
    });

    const project = await prisma.project.create({
      data: {
        name: 'Worker Test Project',
        slug: `worker-test-proj-${Date.now()}`,
        organizationId: org.id,
      },
    });

    const retryPolicy = await prisma.retryPolicy.create({
      data: {
        name: `Exponential Policy ${Date.now()}`,
        strategy: RetryStrategy.EXPONENTIAL,
        baseDelaySec: 2,
        maxAttempts: 3,
      },
    });

    const queue = await prisma.queue.create({
      data: {
        name: `worker-unit-queue-${Date.now()}`,
        projectId: project.id,
        retryPolicyId: retryPolicy.id,
        concurrencyLimit: 5,
        paused: false,
      },
    });

    queueId = queue.id;

    const identity = await registerWorkerNode('test-node');
    workerId = identity.id;
  });

  afterAll(async () => {
    if (workerId) {
      await deregisterWorkerNode(workerId);
    }
    await prisma.$disconnect();
  });

  describe('Worker Identity Lifecycle', () => {
    it('registers worker node and assigns process identity', () => {
      expect(workerId).toBeDefined();
      expect(typeof workerId).toBe('string');
    });

    it('updates worker status to ONLINE and BUSY', async () => {
      await updateWorkerStatus(workerId, 'BUSY');
      const updated = await prisma.worker.findUnique({ where: { id: workerId } });
      expect(updated?.status).toBe('BUSY');
    });
  });

  describe('Job Handler Registry', () => {
    it('lists all registered job types', () => {
      const registeredTypes = defaultRegistry.getRegisteredTypes();
      expect(registeredTypes).toContain('email.send');
      expect(registeredTypes).toContain('billing.charge');
      expect(registeredTypes).toContain('payment.process');
      expect(registeredTypes).toContain('data.process');
      expect(registeredTypes).toContain('db.backup');
      expect(registeredTypes).toContain('custom.task');
    });

    it('executes registered email.send handler successfully', async () => {
      const result = await defaultRegistry.execute({
        id: 'job-1',
        queueId,
        type: 'email.send',
        payload: { recipient: 'test@acme.com', delayMs: 10 },
        priority: 0,
        status: JobStatus.RUNNING,
        attemptCount: 1,
        maxAttempts: 3,
        scheduledAt: null,
        claimedAt: new Date(),
        startedAt: new Date(),
        finishedAt: null,
        lockedByWorkerId: workerId,
        lockExpiresAt: new Date(Date.now() + 30000),
        idempotencyKey: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(result).toHaveProperty('delivered', true);
      expect(result).toHaveProperty('recipient', 'test@acme.com');
    });

    it('executes data.process and payment.process handlers successfully', async () => {
      const dataResult = await defaultRegistry.execute({
        id: 'job-data-1',
        queueId,
        type: 'data.process',
        payload: { file: 'records-batch.csv', recordsCount: 2500, delayMs: 10 },
        priority: 0,
        status: JobStatus.RUNNING,
        attemptCount: 1,
        maxAttempts: 3,
        scheduledAt: null,
        claimedAt: new Date(),
        startedAt: new Date(),
        finishedAt: null,
        lockedByWorkerId: workerId,
        lockExpiresAt: new Date(Date.now() + 30000),
        idempotencyKey: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(dataResult).toHaveProperty('processed', true);
      expect(dataResult).toHaveProperty('recordsCount', 2500);

      const paymentResult = await defaultRegistry.execute({
        id: 'job-pay-1',
        queueId,
        type: 'payment.process',
        payload: { amount: 199.99, currency: 'USD', delayMs: 10 },
        priority: 0,
        status: JobStatus.RUNNING,
        attemptCount: 1,
        maxAttempts: 3,
        scheduledAt: null,
        claimedAt: new Date(),
        startedAt: new Date(),
        finishedAt: null,
        lockedByWorkerId: workerId,
        lockExpiresAt: new Date(Date.now() + 30000),
        idempotencyKey: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(paymentResult).toHaveProperty('status', 'APPROVED');
      expect(paymentResult).toHaveProperty('amount', 199.99);
    });

    it('throws UnknownJobTypeError for unregistered job types', async () => {
      const customRegistry = new JobHandlerRegistry();
      await expect(
        customRegistry.execute({
          id: 'job-2',
          queueId,
          type: 'unregistered.type',
          payload: {},
          priority: 0,
          status: JobStatus.RUNNING,
          attemptCount: 1,
          maxAttempts: 3,
          scheduledAt: null,
          claimedAt: new Date(),
          startedAt: new Date(),
          finishedAt: null,
          lockedByWorkerId: workerId,
          lockExpiresAt: new Date(Date.now() + 30000),
          idempotencyKey: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      ).rejects.toThrow(UnknownJobTypeError);
    });
  });

  describe('Single Job Execution Runner', () => {
    it('processes a claimed data.process job and records COMPLETED state and execution history', async () => {
      const job = await prisma.job.create({
        data: {
          queueId,
          type: 'data.process',
          payload: { recordsCount: 500, delayMs: 10 },
          status: JobStatus.CLAIMED,
          attemptCount: 0,
          maxAttempts: 3,
          claimedAt: new Date(),
          lockedByWorkerId: workerId,
          lockExpiresAt: new Date(Date.now() + 30000),
        },
      });

      const success = await processClaimedJob(job, workerId, defaultRegistry);
      expect(success).toBe(true);

      const dbJob = await prisma.job.findUnique({ where: { id: job.id } });
      expect(dbJob?.status).toBe(JobStatus.COMPLETED);

      const executions = await prisma.jobExecution.findMany({ where: { jobId: job.id } });
      expect(executions.length).toBe(1);
      expect(executions[0].status).toBe('SUCCESS');
    });

    it('processes a claimed payment.process job and records COMPLETED state', async () => {
      const job = await prisma.job.create({
        data: {
          queueId,
          type: 'payment.process',
          payload: { amount: 299.50, delayMs: 10 },
          status: JobStatus.CLAIMED,
          attemptCount: 0,
          maxAttempts: 3,
          claimedAt: new Date(),
          lockedByWorkerId: workerId,
          lockExpiresAt: new Date(Date.now() + 30000),
        },
      });

      const success = await processClaimedJob(job, workerId, defaultRegistry);
      expect(success).toBe(true);

      const dbJob = await prisma.job.findUnique({ where: { id: job.id } });
      expect(dbJob?.status).toBe(JobStatus.COMPLETED);
    });

    it('routes unknown job type (foo.bar) to SCHEDULED retry state when attemptCount < maxAttempts', async () => {
      const job = await prisma.job.create({
        data: {
          queueId,
          type: 'foo.bar',
          payload: { test: 'retry_path' },
          status: JobStatus.CLAIMED,
          attemptCount: 0,
          maxAttempts: 3,
          claimedAt: new Date(),
          lockedByWorkerId: workerId,
          lockExpiresAt: new Date(Date.now() + 30000),
        },
      });

      const success = await processClaimedJob(job, workerId, defaultRegistry);
      expect(success).toBe(false);

      const dbJob = await prisma.job.findUnique({ where: { id: job.id } });
      expect(dbJob?.status).toBe(JobStatus.SCHEDULED);
    });

    it('routes unknown job type (foo.bar) to FAILED & Dead Letter Queue when max attempts are reached', async () => {
      const job = await prisma.job.create({
        data: {
          queueId,
          type: 'foo.bar',
          payload: { test: 'dlq_path' },
          status: JobStatus.CLAIMED,
          attemptCount: 3,
          maxAttempts: 3, // Max attempts reached
          claimedAt: new Date(),
          lockedByWorkerId: workerId,
          lockExpiresAt: new Date(Date.now() + 30000),
        },
      });

      const success = await processClaimedJob(job, workerId, defaultRegistry);
      expect(success).toBe(false);

      const dbJob = await prisma.job.findUnique({ where: { id: job.id } });
      expect(dbJob?.status).toBe(JobStatus.FAILED);

      const dlqEntry = await prisma.deadLetterJob.findUnique({ where: { originalJobId: job.id } });
      expect(dlqEntry).not.toBeNull();
      expect(dlqEntry?.status).toBe(DLQStatus.UNRESOLVED);
      expect(JSON.stringify(dlqEntry?.lastError)).toContain('UnknownJobTypeError');
    });
  });

  describe('Worker Poller Engine', () => {
    it('respects paused queue status and avoids polling paused queues', async () => {
      const pausedQueue = await prisma.queue.create({
        data: {
          name: `paused-queue-${Date.now()}`,
          projectId: (await prisma.queue.findUnique({ where: { id: queueId } }))!.projectId,
          concurrencyLimit: 5,
          paused: true,
        },
      });

      await prisma.job.create({
        data: {
          queueId: pausedQueue.id,
          type: 'email.send',
          payload: { recipient: 'paused@acme.com' },
          status: JobStatus.QUEUED,
        },
      });

      const poller = new WorkerPoller({
        workerId,
        targetQueueIds: [pausedQueue.id],
        pollIntervalMs: 100,
        maxWorkerConcurrency: 2,
      });

      poller.start();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await poller.stop();

      const jobAfter = await prisma.job.findFirst({ where: { queueId: pausedQueue.id } });
      expect(jobAfter?.status).toBe(JobStatus.QUEUED);
    });
  });
});
