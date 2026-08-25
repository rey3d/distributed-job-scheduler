import { RetryStrategy, PrismaClient, JobStatus, ExecutionStatus, DLQStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../index';
import { JobNotFoundError } from './types';

function getDb(client: any): any {
  if (client && (typeof client.$transaction === 'function' || typeof client.job?.findUnique === 'function')) {
    return client;
  }
  if (defaultPrisma && typeof defaultPrisma.$transaction === 'function') return defaultPrisma;
  return (defaultPrisma as any)?.prisma || client;
}

/**
 * Calculates the next retry delay in seconds based on strategy (FIXED, LINEAR, EXPONENTIAL).
 */
export function calculateNextRetryDelay(
  attempt: number,
  strategy: RetryStrategy,
  baseDelaySec: number,
  maxDelayCapSec: number = 3600
): number {
  if (attempt <= 0) return baseDelaySec;

  let delay = baseDelaySec;

  switch (strategy) {
    case RetryStrategy.FIXED:
      delay = baseDelaySec;
      break;

    case RetryStrategy.LINEAR:
      delay = attempt * baseDelaySec;
      break;

    case RetryStrategy.EXPONENTIAL:
      delay = baseDelaySec * Math.pow(2, attempt - 1);
      break;

    default:
      delay = baseDelaySec;
  }

  return Math.min(Math.round(delay), maxDelayCapSec);
}

/**
 * Handles a job execution failure. Updates the execution record, evaluates the queue's
 * retry policy, and either schedules a retry or exhausts the job to the Dead Letter Queue.
 */
export async function handleJobFailure(
  jobId: string,
  executionId: string,
  errorPayload: any,
  client: PrismaClient | any = defaultPrisma
): Promise<{ retried: boolean; scheduledAt?: Date; deadLetterId?: string }> {
  const db = getDb(client);

  const runInTx = async (tx: any) => {
    const job = await tx.job.findUnique({
      where: { id: jobId },
      include: {
        queue: {
          include: {
            retryPolicy: true,
          },
        },
      },
    });

    if (!job) {
      throw new JobNotFoundError(jobId);
    }

    // 1. Conclude the active JobExecution record
    const execution = await tx.jobExecution.findUnique({
      where: { id: executionId },
    });

    const finishedAt = new Date();
    const durationMs = execution
      ? Math.max(0, finishedAt.getTime() - execution.startedAt.getTime())
      : null;

    await tx.jobExecution.update({
      where: { id: executionId },
      data: {
        status: ExecutionStatus.FAILED,
        finishedAt,
        durationMs,
        error: errorPayload || { message: 'Job execution failed' },
      },
    });

    // 2. Evaluate Retry Policy
    const currentAttempt = job.attemptCount + 1;
    const policy = job.queue.retryPolicy;

    const maxAttempts = Math.min(
      job.maxAttempts,
      policy?.maxAttempts ?? job.maxAttempts
    );
    const strategy = policy?.strategy ?? RetryStrategy.EXPONENTIAL;
    const baseDelaySec = policy?.baseDelaySec ?? 5;
    const maxDelayCapSec = policy?.maxDelayCapSec ?? 3600;

    if (currentAttempt < maxAttempts) {
      // Job has remaining attempts -> Schedule Retry
      const delaySec = calculateNextRetryDelay(currentAttempt, strategy, baseDelaySec, maxDelayCapSec);
      const scheduledAt = new Date(Date.now() + delaySec * 1000);
      const nextStatus = delaySec > 0 ? JobStatus.SCHEDULED : JobStatus.QUEUED;

      await tx.job.update({
        where: { id: jobId },
        data: {
          status: nextStatus,
          attemptCount: currentAttempt,
          scheduledAt,
          lockedByWorkerId: null,
          lockExpiresAt: null,
          updatedAt: new Date(),
        },
      });

      await tx.jobLog.create({
        data: {
          jobId,
          executionId,
          level: 'WARN',
          message: `Job attempt #${currentAttempt} failed. Scheduled retry #${currentAttempt + 1} in ${delaySec}s via ${strategy} policy.`,
          meta: {
            attempt: currentAttempt,
            delaySec,
            strategy,
            error: errorPayload,
          },
          timestamp: new Date(),
        },
      });

      return { retried: true, scheduledAt };
    } else {
      // Attempts exhausted -> Move to Dead Letter Queue
      await tx.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.FAILED,
          attemptCount: currentAttempt,
          finishedAt,
          lockedByWorkerId: null,
          lockExpiresAt: null,
          updatedAt: new Date(),
        },
      });

      const dlq = await tx.deadLetterJob.create({
        data: {
          originalJobId: jobId,
          queueId: job.queueId,
          failedAt: finishedAt,
          lastError: errorPayload || { message: 'Max attempts exhausted' },
          totalAttempts: currentAttempt,
          payload: job.payload,
          status: DLQStatus.UNRESOLVED,
        },
      });

      await tx.jobLog.create({
        data: {
          jobId,
          executionId,
          level: 'ERROR',
          message: `Job exhausted all ${maxAttempts} attempts. Moved to Dead Letter Queue (DLQ ID: ${dlq.id}).`,
          meta: {
            totalAttempts: currentAttempt,
            deadLetterId: dlq.id,
            error: errorPayload,
          },
          timestamp: new Date(),
        },
      });

      return { retried: false, deadLetterId: dlq.id };
    }
  };

  if (typeof db.$transaction === 'function') {
    return await db.$transaction(runInTx);
  } else {
    return await runInTx(db);
  }
}
