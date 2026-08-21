import { JobStatus, PrismaClient, LogLevel, Job } from '@prisma/client';
import { prisma as defaultPrisma } from '../index';
import { InvalidStateTransitionError, JobNotFoundError, TransitionLogOptions } from './types';

function getDb(client: any): any {
  if (client && (typeof client.$transaction === 'function' || typeof client.job?.findUnique === 'function')) {
    return client;
  }
  if (defaultPrisma && typeof defaultPrisma.$transaction === 'function') return defaultPrisma;
  return (defaultPrisma as any)?.prisma || client;
}

// Map of allowed target states from each current state
const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  QUEUED: [JobStatus.CLAIMED, JobStatus.CANCELLED],
  SCHEDULED: [JobStatus.QUEUED, JobStatus.CANCELLED],
  CLAIMED: [JobStatus.RUNNING, JobStatus.QUEUED, JobStatus.FAILED, JobStatus.CANCELLED],
  RUNNING: [JobStatus.COMPLETED, JobStatus.QUEUED, JobStatus.SCHEDULED, JobStatus.FAILED, JobStatus.CANCELLED],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

/**
 * Validates whether a state transition from currentStatus to targetStatus is allowed.
 */
export function isValidStateTransition(currentStatus: JobStatus, targetStatus: JobStatus): boolean {
  if (currentStatus === targetStatus) return true;
  const allowed = VALID_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(targetStatus) : false;
}

/**
 * Transitions a job to a new status atomically, enforcing valid state machine rules
 * and creating an audit log entry in the JobLog table.
 */
export async function transitionJobState(
  jobId: string,
  targetStatus: JobStatus,
  actor: string,
  logOptions?: TransitionLogOptions,
  client: PrismaClient | any = defaultPrisma
): Promise<Job> {
  const db = getDb(client);

  const runInTx = async (tx: any) => {
    const job = await tx.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new JobNotFoundError(jobId);
    }

    if (!isValidStateTransition(job.status, targetStatus)) {
      throw new InvalidStateTransitionError(job.status, targetStatus, jobId);
    }

    // Update job status and timestamps
    const updateData: any = {
      status: targetStatus,
      updatedAt: new Date(),
    };

    if (targetStatus === JobStatus.CLAIMED) {
      updateData.claimedAt = new Date();
    } else if (targetStatus === JobStatus.RUNNING) {
      updateData.startedAt = updateData.startedAt || new Date();
    } else if (targetStatus === JobStatus.COMPLETED || targetStatus === JobStatus.FAILED) {
      updateData.finishedAt = new Date();
      updateData.lockedByWorkerId = null;
      updateData.lockExpiresAt = null;
    } else if (targetStatus === JobStatus.QUEUED) {
      // Re-queuing releases worker lock
      updateData.lockedByWorkerId = null;
      updateData.lockExpiresAt = null;
    }

    const updatedJob = await tx.job.update({
      where: { id: jobId },
      data: updateData,
    });

    // Write audit log entry
    const logMessage =
      logOptions?.message ||
      `Job transition: '${job.status}' -> '${targetStatus}' by actor '${actor}'`;

    await tx.jobLog.create({
      data: {
        jobId,
        level: logOptions?.level || LogLevel.INFO,
        message: logMessage,
        meta: {
          previousStatus: job.status,
          newStatus: targetStatus,
          actor,
          ...(logOptions?.meta || {}),
        },
        timestamp: new Date(),
      },
    });

    return updatedJob;
  };

  if (typeof db.$transaction === 'function') {
    return await db.$transaction(runInTx);
  } else {
    return await runInTx(db);
  }
}
