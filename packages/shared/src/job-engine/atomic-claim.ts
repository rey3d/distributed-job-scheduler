import { Job, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../index';
import { ClaimOptions } from './types';

/**
 * Atomically claims the next eligible job for a worker using PostgreSQL SELECT ... FOR UPDATE SKIP LOCKED.
 * Guarantees zero race conditions or double-claiming under high concurrency.
 */
export async function claimNextJob(
  queueId: string,
  workerId: string,
  options?: ClaimOptions,
  client: PrismaClient | any = defaultPrisma
): Promise<Job | null> {
  const lockDurationSec = options?.lockDurationSec || 30;

  return await client.$transaction(async (tx: any) => {
    // Perform raw atomic query with FOR UPDATE SKIP LOCKED
    const rawResult = await tx.$queryRaw`
      UPDATE jobs
      SET 
        status = 'CLAIMED'::"JobStatus",
        "claimedAt" = NOW(),
        "lockedByWorkerId" = ${workerId}::uuid,
        "lockExpiresAt" = NOW() + (${lockDurationSec} || ' seconds')::INTERVAL,
        "updatedAt" = NOW()
      WHERE id = (
        SELECT j.id
        FROM jobs j
        INNER JOIN queues q ON j."queueId" = q.id
        WHERE j."queueId" = ${queueId}::uuid
          AND q.paused = false
          AND j.status = 'QUEUED'::"JobStatus"
          AND (j."scheduledAt" IS NULL OR j."scheduledAt" <= NOW())
        ORDER BY j.priority DESC, j."createdAt" ASC
        FOR UPDATE OF j SKIP LOCKED
        LIMIT 1
      )
      RETURNING *;
    `;

    const claimedJobs = rawResult as Job[];
    if (!claimedJobs || claimedJobs.length === 0) {
      return null;
    }

    const job = claimedJobs[0];

    // Record audit log for state transition
    await tx.jobLog.create({
      data: {
        jobId: job.id,
        level: 'INFO',
        message: `Job claimed atomically by worker '${workerId}'`,
        meta: {
          previousStatus: 'QUEUED',
          newStatus: 'CLAIMED',
          actor: workerId,
          lockDurationSec,
        },
        timestamp: new Date(),
      },
    });

    return job;
  });
}
