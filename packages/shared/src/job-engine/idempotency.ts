import { Job, PrismaClient, JobStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../index';

export interface EnqueueJobOptions {
  priority?: number;
  maxAttempts?: number;
  scheduledAt?: Date;
}

export interface EnqueueResult {
  job: Job;
  duplicate: boolean;
}

/**
 * Enqueues a job with an optional idempotencyKey. Prevents duplicate execution side effects
 * when re-submitting the same logical job payload across distributed callers.
 */
export async function enqueueJobWithIdempotency(
  queueId: string,
  type: string,
  payload: any,
  idempotencyKey?: string | null,
  options?: EnqueueJobOptions,
  client: PrismaClient | any = defaultPrisma
): Promise<EnqueueResult> {
  // 1. Fast lookup if idempotencyKey is provided
  if (idempotencyKey) {
    const existingJob = await client.job.findUnique({
      where: { idempotencyKey },
    });

    if (existingJob) {
      return { job: existingJob, duplicate: true };
    }
  }

  // 2. Attempt creation
  try {
    const newJob = await client.job.create({
      data: {
        queueId,
        type,
        payload,
        idempotencyKey: idempotencyKey || null,
        priority: options?.priority ?? 0,
        maxAttempts: options?.maxAttempts ?? 3,
        scheduledAt: options?.scheduledAt || null,
        // A caller supplying a schedule explicitly creates a scheduled record,
        // even if the timestamp is already due. The scheduler performs the
        // SCHEDULED -> QUEUED transition, preserving one lifecycle path.
        status: options?.scheduledAt ? JobStatus.SCHEDULED : JobStatus.QUEUED,
      },
    });

    // Write initial enqueued log entry
    await client.jobLog.create({
      data: {
        jobId: newJob.id,
        level: 'INFO',
        message: `Job '${type}' enqueued into queue '${queueId}'${idempotencyKey ? ` with idempotency key '${idempotencyKey}'` : ''}`,
        meta: {
          queueId,
          type,
          idempotencyKey,
        },
        timestamp: new Date(),
      },
    });

    return { job: newJob, duplicate: false };
  } catch (err: any) {
    // 3. Catch concurrent duplicate insertion race condition (Prisma P2002 Unique Constraint)
    if (idempotencyKey && err.code === 'P2002') {
      const existingJob = await client.job.findUnique({
        where: { idempotencyKey },
      });
      if (existingJob) {
        return { job: existingJob, duplicate: true };
      }
    }
    throw err;
  }
}
