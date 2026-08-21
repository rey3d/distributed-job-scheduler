import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, JobStatus, RetryStrategy } from '@job-scheduler/shared';
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
    it('processes a claimed job and records COMPLETED state and execution history', async () => {
      const job = await prisma.job.create({
        data: {
          queueId,
          type: 'billing.charge',
          payload: { amount: 49.99, delayMs: 10 },
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
