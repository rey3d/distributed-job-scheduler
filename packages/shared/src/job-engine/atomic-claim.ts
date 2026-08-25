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
    // Serialize claim decisions for this queue only. A row-level SKIP LOCKED
    // lock on the queue itself would make competing workers return empty while
    // the queue row is held. The transaction-scoped advisory lock waits for the
    // short claim transaction, then lets the next worker evaluate fresh active
    // work and the configured shared concurrency limit.
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${queueId}::text));
    `;

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
          -- The advisory lock above serializes the count-and-claim decision for
          -- this queue, so the concurrency limit holds across all workers.
          AND (
            SELECT COUNT(*)
            FROM jobs active_jobs
            WHERE active_jobs."queueId" = j."queueId"
              AND active_jobs.status IN ('CLAIMED'::"JobStatus", 'RUNNING'::"JobStatus")
          ) < q."concurrencyLimit"
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
