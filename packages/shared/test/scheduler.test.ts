import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/index';
import { JobStatus } from '@prisma/client';
import { promoteDueScheduledJobs } from '../src/job-engine/scheduler';
import { enqueueJobWithIdempotency } from '../src/job-engine/idempotency';

describe('Scheduled job promotion', () => {
  let queueId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: 'Scheduler Org', slug: `sched-org-${Date.now()}` },
    });
    const project = await prisma.project.create({
      data: {
        organizationId: org.id,
        name: 'Scheduler Project',
        slug: `sched-proj-${Date.now()}`,
      },
    });
    const queue = await prisma.queue.create({
      data: { projectId: project.id, name: `sched-queue-${Date.now()}` },
    });
    queueId = queue.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('promotes due SCHEDULED jobs to QUEUED and leaves future jobs scheduled', async () => {
    const due = await enqueueJobWithIdempotency(queueId, 'email.send', { n: 1 }, null, {
      scheduledAt: new Date(Date.now() - 1000),
    });
    const future = await enqueueJobWithIdempotency(queueId, 'email.send', { n: 2 }, null, {
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    expect(due.job.status).toBe(JobStatus.SCHEDULED);
    expect(future.job.status).toBe(JobStatus.SCHEDULED);

    const promoted = await promoteDueScheduledJobs();
    expect(promoted).toBeGreaterThanOrEqual(1);

    const dueAfter = await prisma.job.findUnique({ where: { id: due.job.id } });
    const futureAfter = await prisma.job.findUnique({ where: { id: future.job.id } });

    expect(dueAfter?.status).toBe(JobStatus.QUEUED);
    expect(futureAfter?.status).toBe(JobStatus.SCHEDULED);
  });
});
