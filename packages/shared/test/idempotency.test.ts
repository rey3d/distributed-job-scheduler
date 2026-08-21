import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/index';
import { enqueueJobWithIdempotency } from '../src/job-engine/idempotency';

describe('Idempotency Guard Integration Test', () => {
  let queueId: string;

  beforeAll(async () => {
    // Seed Org -> Project -> Queue
    const org = await prisma.organization.create({
      data: {
        name: 'Idempotency Test Org',
        slug: `idempotency-org-${Date.now()}`,
      },
    });

    const project = await prisma.project.create({
      data: {
        organizationId: org.id,
        name: 'Idempotency Project',
        slug: `idempotency-proj-${Date.now()}`,
      },
    });

    const queue = await prisma.queue.create({
      data: {
        projectId: project.id,
        name: `idempotency-queue-${Date.now()}`,
      },
    });

    queueId = queue.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('prevents duplicate job creation when re-submitting with matching idempotencyKey', async () => {
    const key = `webhook-event-${Date.now()}`;
    const payload = { event: 'payment.succeeded', amount: 500 };

    // First Submission
    const res1 = await enqueueJobWithIdempotency(queueId, 'payment.process', payload, key);
    expect(res1.duplicate).toBe(false);
    expect(res1.job.idempotencyKey).toBe(key);

    // Second Submission with SAME idempotencyKey
    const res2 = await enqueueJobWithIdempotency(queueId, 'payment.process', payload, key);
    expect(res2.duplicate).toBe(true);
    expect(res2.job.id).toBe(res1.job.id); // Must return EXACT SAME existing job ID!
  });
});
