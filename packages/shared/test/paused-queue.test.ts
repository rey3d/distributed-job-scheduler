import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/index';
import { claimNextJob } from '../src/job-engine/atomic-claim';

describe('Paused Queue Claiming Prevention Integration Test', () => {
  let queueId: string;
  let workerId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: 'Paused Queue Test Org',
        slug: `paused-org-${Date.now()}`,
      },
    });

    const project = await prisma.project.create({
      data: {
        organizationId: org.id,
        name: 'Paused Queue Test Project',
        slug: `paused-proj-${Date.now()}`,
      },
    });

    // Create a PAUSED queue
    const queue = await prisma.queue.create({
      data: {
        projectId: project.id,
        name: `paused-queue-${Date.now()}`,
        paused: true, // Queue is paused
      },
    });

    const worker = await prisma.worker.create({
      data: {
        name: `paused-worker-${Date.now()}`,
        hostname: 'localhost',
        processId: process.pid,
      },
    });

    queueId = queue.id;
    workerId = worker.id;

    // Add a QUEUED job to the paused queue
    await prisma.job.create({
      data: {
        queueId,
        type: 'email.send',
        payload: { recipient: 'paused@example.com' },
        status: 'QUEUED',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('prevents workers from claiming jobs while the queue is paused', async () => {
    // Attempt claim on paused queue
    const claimedJob = await claimNextJob(queueId, workerId);
    expect(claimedJob).toBeNull();

    // Unpause queue
    await prisma.queue.update({
      where: { id: queueId },
      data: { paused: false },
    });

    // Attempt claim on unpaused queue
    const unpausedClaim = await claimNextJob(queueId, workerId);
    expect(unpausedClaim).not.toBeNull();
    expect(unpausedClaim?.status).toBe('CLAIMED');
  });
});
