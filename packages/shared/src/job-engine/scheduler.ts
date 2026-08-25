import { JobStatus, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../index';

/**
 * Promotes due delayed/retry jobs from SCHEDULED → QUEUED so workers can claim them.
 * Required because atomic claiming only picks QUEUED rows.
 */
export async function promoteDueScheduledJobs(
  client: PrismaClient | any = defaultPrisma
): Promise<number> {
  const result = await client.job.updateMany({
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
