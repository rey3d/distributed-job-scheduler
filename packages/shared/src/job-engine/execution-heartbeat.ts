import { JobExecution, WorkerHeartbeat, PrismaClient, JobStatus, ExecutionStatus, DLQStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../index';
import { transitionJobState } from './state-machine';
import { JobNotFoundError } from './types';

function getDb(client: any): any {
  if (client && (typeof client.$transaction === 'function' || typeof client.job?.findUnique === 'function')) {
    return client;
  }
  if (defaultPrisma && typeof defaultPrisma.$transaction === 'function') return defaultPrisma;
  return (defaultPrisma as any)?.prisma || client;
}

/**
 * Starts a job execution attempt by transitioning the job to RUNNING
 * and creating a new JobExecution tracking row.
 */
export async function startExecution(
  jobId: string,
  workerId: string,
  client: PrismaClient | any = defaultPrisma
): Promise<JobExecution> {
  const db = getDb(client);

  const runInTx = async (tx: any) => {
    const job = await tx.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new JobNotFoundError(jobId);
    }

    // Transition state from CLAIMED -> RUNNING
    await transitionJobState(
      jobId,
      JobStatus.RUNNING,
      workerId,
      { message: `Execution attempt #${job.attemptCount + 1} started by worker '${workerId}'` },
      tx
    );

    // Create Execution Record
    const execution = await tx.jobExecution.create({
      data: {
        jobId,
        workerId,
        attempt: job.attemptCount + 1,
        status: ExecutionStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    return execution;
  };

  if (typeof db.$transaction === 'function') {
    return await db.$transaction(runInTx);
  } else {
    return await runInTx(db);
  }
}

/**
 * Records a periodic liveness ping from a worker, updating worker lastSeenAt
 * and extending the lock duration on the active job.
 */
export async function recordHeartbeat(
  jobId: string,
  workerId: string,
  metrics?: Record<string, any>,
  client: PrismaClient | any = defaultPrisma
): Promise<WorkerHeartbeat> {
  const db = getDb(client);

  const runInTx = async (tx: any) => {
    // 1. Emit Heartbeat row
    const heartbeat = await tx.workerHeartbeat.create({
      data: {
        workerId,
        currentJobId: jobId,
        metrics: metrics || {},
        timestamp: new Date(),
      },
    });

    // 2. Update Worker lastSeenAt
    await tx.worker.update({
      where: { id: workerId },
      data: {
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // 3. Extend lock duration on Job (+30 seconds)
    const nextLockExpiry = new Date(Date.now() + 30 * 1000);
    await tx.job.update({
      where: { id: jobId },
      data: {
        lockExpiresAt: nextLockExpiry,
        updatedAt: new Date(),
      },
    });

    return heartbeat;
  };

  if (typeof db.$transaction === 'function') {
    return await db.$transaction(runInTx);
  } else {
    return await runInTx(db);
  }
}

/**
 * Reaps orphaned or stuck jobs whose worker locks or heartbeats have expired.
 * Re-queues eligible jobs for retry or exhausts them to the Dead Letter Queue (DLQ).
 */
export async function reapStaleJobs(
  client: PrismaClient | any = defaultPrisma
): Promise<number> {
  const db = getDb(client);
  const now = new Date();

  // Find all CLAIMED or RUNNING jobs whose lockExpiresAt is in the past
  const staleJobs = await db.job.findMany({
    where: {
      status: { in: [JobStatus.CLAIMED, JobStatus.RUNNING] },
      lockExpiresAt: { lt: now },
    },
    include: {
      queue: {
        include: {
          retryPolicy: true,
        },
      },
    },
  });

  let reapedCount = 0;

  for (const job of staleJobs) {
    try {
      const runInTx = async (tx: any) => {
        // 1. Fail any open JobExecution records in RUNNING status for this job
        const runningExecutions = await tx.jobExecution.findMany({
          where: {
            jobId: job.id,
            status: ExecutionStatus.RUNNING,
          },
        });

        for (const exec of runningExecutions) {
          const durationMs = exec.startedAt
            ? Math.max(0, now.getTime() - exec.startedAt.getTime())
            : null;

          await tx.jobExecution.update({
            where: { id: exec.id },
            data: {
              status: ExecutionStatus.FAILED,
              finishedAt: now,
              durationMs,
              error: {
                message: 'Worker lock expired / heartbeat timeout (Reaped by system)',
                reapedAt: now.toISOString(),
                previousWorkerId: job.lockedByWorkerId || null,
              },
            },
          });
        }

        // 2. Determine max attempts and evaluate whether to retry or move to DLQ
        const policy = job.queue?.retryPolicy;
        const maxAttempts = policy?.maxAttempts ?? job.maxAttempts;
        const nextAttempt = job.attemptCount + 1;

        if (nextAttempt < maxAttempts) {
          // Re-queue for next attempt
          await tx.job.update({
            where: { id: job.id },
            data: {
              status: JobStatus.QUEUED,
              attemptCount: nextAttempt,
              lockedByWorkerId: null,
              lockExpiresAt: null,
              updatedAt: now,
            },
          });

          await tx.jobLog.create({
            data: {
              jobId: job.id,
              level: 'WARN',
              message: `Job reaped and re-queued due to stale worker lock / heartbeat timeout (Previous worker: ${job.lockedByWorkerId || 'unknown'})`,
              meta: {
                previousStatus: job.status,
                newStatus: JobStatus.QUEUED,
                actor: 'system:reaper',
                attemptCount: nextAttempt,
                maxAttempts,
              },
              timestamp: now,
            },
          });
        } else {
          // Exhausted max attempts -> Move to Dead Letter Queue (DLQ)
          await tx.job.update({
            where: { id: job.id },
            data: {
              status: JobStatus.FAILED,
              attemptCount: nextAttempt,
              finishedAt: now,
              lockedByWorkerId: null,
              lockExpiresAt: null,
              updatedAt: now,
            },
          });

          const dlq = await tx.deadLetterJob.create({
            data: {
              originalJobId: job.id,
              queueId: job.queueId,
              failedAt: now,
              lastError: {
                message: `Max attempts (${maxAttempts}) exhausted during stale worker lock reap`,
                reapedAt: now.toISOString(),
                previousWorkerId: job.lockedByWorkerId || null,
              },
              totalAttempts: nextAttempt,
              payload: job.payload,
              status: DLQStatus.UNRESOLVED,
            },
          });

          await tx.jobLog.create({
            data: {
              jobId: job.id,
              level: 'ERROR',
              message: `Job exhausted all ${maxAttempts} attempts during stale lock reap. Moved to Dead Letter Queue (DLQ ID: ${dlq.id}).`,
              meta: {
                totalAttempts: nextAttempt,
                maxAttempts,
                deadLetterId: dlq.id,
                actor: 'system:reaper',
              },
              timestamp: now,
            },
          });
        }
      };

      if (typeof db.$transaction === 'function') {
        await db.$transaction(runInTx);
      } else {
        await runInTx(db);
      }

      reapedCount++;
    } catch (err) {
      console.error(`Failed to reap stale job ${job.id}:`, err);
    }
  }

  return reapedCount;
}
