import {
  prisma,
  enqueueJobWithIdempotency,
  JobStatus,
} from '@job-scheduler/shared';
import cronParser from 'cron-parser';

/**
 * Promotes due delayed/retry jobs from SCHEDULED → QUEUED so workers can claim them.
 * Implemented in the worker process so it does not depend on a rebuilt shared dist bundle.
 */
export async function promoteDueScheduledJobs(): Promise<number> {
  const result = await prisma.job.updateMany({
    where: {
      status: JobStatus.SCHEDULED,
      OR: [{ scheduledAt: { lte: new Date() } }, { scheduledAt: null }],
    },
    data: {
      status: JobStatus.QUEUED,
      updatedAt: new Date(),
    },
  });

  return result.count;
}

/**
 * Atomically dispatch due recurring cron definitions into their queues.
 * Uses SKIP LOCKED so multiple worker processes cannot double-fire the same schedule.
 */
export async function dispatchDueCronJobs(limit = 20): Promise<number> {
  let dispatched = 0;

  for (let i = 0; i < limit; i++) {
    const claimed = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{
        id: string;
        queueId: string;
        name: string;
        jobType: string;
        payload: unknown;
        cronExpression: string | null;
      }>>`
        UPDATE scheduled_jobs
        SET "lastRunAt" = NOW(),
            "updatedAt" = NOW()
        WHERE id = (
          SELECT id
          FROM scheduled_jobs
          WHERE enabled = true
            AND "nextRunAt" <= NOW()
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING id, "queueId", name, "jobType", payload, "cronExpression";
      `;

      return rows[0] || null;
    });

    if (!claimed) {
      break;
    }

    try {
      await enqueueJobWithIdempotency(claimed.queueId, claimed.jobType, claimed.payload, null, {
        priority: 0,
        maxAttempts: 3,
      });

      let nextRunAt = new Date(Date.now() + 60_000);
      if (claimed.cronExpression) {
        const interval = cronParser.parseExpression(claimed.cronExpression);
        nextRunAt = interval.next().toDate();
      }

      await prisma.scheduledJob.update({
        where: { id: claimed.id },
        data: { nextRunAt },
      });

      dispatched++;
    } catch (err: any) {
      console.error(
        `⚠️ [Scheduler] Failed to dispatch cron job '${claimed.name}' (${claimed.id}): ${err.message}`
      );
    }
  }

  return dispatched;
}
