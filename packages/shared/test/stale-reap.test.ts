import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/index';
import { reapStaleJobs, startExecution } from '../src/job-engine/execution-heartbeat';

describe('Crashed Worker Stale Job Reaper Integration Test', () => {
  let queueId: string;
  let workerId: string;

  beforeAll(async () => {
    // Seed Org -> Project -> Queue -> Worker
    const org = await prisma.organization.create({
      data: {
        name: 'Reaper Test Org',
        slug: `reaper-org-${Date.now()}`,
      },
    });

    const project = await prisma.project.create({
      data: {
        organizationId: org.id,
        name: 'Reaper Test Project',
        slug: `reaper-proj-${Date.now()}`,
      },
    });

    const queue = await prisma.queue.create({
      data: {
        projectId: project.id,
        name: `reaper-queue-${Date.now()}`,
      },
    });

    const worker = await prisma.worker.create({
      data: {
        name: `crashed-worker-${Date.now()}`,
        hostname: 'localhost',
        processId: 9999,
      },
    });

    queueId = queue.id;
    workerId = worker.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reaps crashed worker jobs with expired locks while leaving active worker jobs intact', async () => {
    // 1. Create a STALE job (simulating a crashed worker whose lock expired 10s ago)
    const staleJob = await prisma.job.create({
      data: {
        queueId,
        type: 'data.process',
        payload: { file: 'chunk-1.csv' },
        status: 'CLAIMED',
        attemptCount: 0,
        maxAttempts: 3,
        lockedByWorkerId: workerId,
        lockExpiresAt: new Date(Date.now() - 10000), // Expired 10s ago
      },
    });

    // 2. Create an ACTIVE job (healthy worker whose lock expires in 30s)
    const activeJob = await prisma.job.create({
      data: {
        queueId,
        type: 'data.process',
        payload: { file: 'chunk-2.csv' },
        status: 'CLAIMED',
        attemptCount: 0,
        maxAttempts: 3,
        lockedByWorkerId: workerId,
        lockExpiresAt: new Date(Date.now() + 30000), // Valid for 30s
      },
    });

    // 3. Execute the stale job reaper sweep
    const reapedCount = await reapStaleJobs();

    expect(reapedCount).toBeGreaterThanOrEqual(1);

    // 4. Verify stale job was re-queued, lock cleared, attempt count incremented
    const updatedStaleJob = await prisma.job.findUnique({
      where: { id: staleJob.id },
    });

    expect(updatedStaleJob?.status).toBe('QUEUED');
    expect(updatedStaleJob?.attemptCount).toBe(1);
    expect(updatedStaleJob?.lockedByWorkerId).toBeNull();
    expect(updatedStaleJob?.lockExpiresAt).toBeNull();

    // 5. Verify healthy active job was NOT reaped
    const updatedActiveJob = await prisma.job.findUnique({
      where: { id: activeJob.id },
    });

    expect(updatedActiveJob?.status).toBe('CLAIMED');
    expect(updatedActiveJob?.lockedByWorkerId).toBe(workerId);

    // 6. Verify audit log entry was created for the reaped job
    const logs = await prisma.jobLog.findMany({
      where: { jobId: staleJob.id },
    });

    expect(logs.some((l) => l.message.includes('stale worker lock'))).toBe(true);
  });

  it('fails open JobExecution tracking records when reaping a RUNNING job', async () => {
    // 1. Create job and start execution
    const job = await prisma.job.create({
      data: {
        queueId,
        type: 'email.send',
        payload: { to: 'user@example.com' },
        status: 'CLAIMED',
        attemptCount: 0,
        maxAttempts: 3,
        lockedByWorkerId: workerId,
        lockExpiresAt: new Date(Date.now() - 5000), // Expired
      },
    });

    const execution = await startExecution(job.id, workerId);

    // Artificially set job lock to expired after startExecution extended it
    await prisma.job.update({
      where: { id: job.id },
      data: { lockExpiresAt: new Date(Date.now() - 5000) },
    });

    // 2. Reap stale jobs
    await reapStaleJobs();

    // 3. Verify JobExecution record status was updated to FAILED
    const updatedExec = await prisma.jobExecution.findUnique({
      where: { id: execution.id },
    });

    expect(updatedExec?.status).toBe('FAILED');
    expect(updatedExec?.finishedAt).not.toBeNull();
    expect((updatedExec?.error as any)?.message).toContain('Worker lock expired');
  });

  it('moves job to Dead Letter Queue (DLQ) when maxAttempts is reached during reaping', async () => {
    // 1. Create a stale job with attemptCount = 2 and maxAttempts = 3 (final attempt expiring)
    const exhaustedJob = await prisma.job.create({
      data: {
        queueId,
        type: 'payment.charge',
        payload: { amount: 100 },
        status: 'RUNNING',
        attemptCount: 2,
        maxAttempts: 3,
        lockedByWorkerId: workerId,
        lockExpiresAt: new Date(Date.now() - 10000), // Expired
      },
    });

    // 2. Run reaper sweep
    await reapStaleJobs();

    // 3. Verify job status updated to FAILED
    const updatedJob = await prisma.job.findUnique({
      where: { id: exhaustedJob.id },
    });

    expect(updatedJob?.status).toBe('FAILED');
    expect(updatedJob?.attemptCount).toBe(3);

    // 4. Verify DeadLetterJob entry created in DLQ
    const dlqEntry = await prisma.deadLetterJob.findUnique({
      where: { originalJobId: exhaustedJob.id },
    });

    expect(dlqEntry).not.toBeNull();
    expect(dlqEntry?.status).toBe('UNRESOLVED');
    expect(dlqEntry?.totalAttempts).toBe(3);
    expect((dlqEntry?.lastError as any)?.message).toContain('Max attempts (3) exhausted during stale worker lock reap');

    // 5. Verify ERROR level audit log entry
    const logs = await prisma.jobLog.findMany({
      where: { jobId: exhaustedJob.id },
    });

    expect(logs.some((l) => l.level === 'ERROR' && l.message.includes('Dead Letter Queue'))).toBe(true);
  });
});

