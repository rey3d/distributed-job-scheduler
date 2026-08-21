import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/index';
import { claimNextJob } from '../src/job-engine/atomic-claim';

describe('Real PostgreSQL High-Concurrency Job Claiming Test', () => {
  let queueId: string;
  let workerId: string;

  beforeAll(async () => {
    // 1. Seed tenant organization, project, queue, and worker
    const org = await prisma.organization.create({
      data: {
        name: 'Concurrency Benchmark Org',
        slug: `concurrency-org-${Date.now()}`,
      },
    });

    const project = await prisma.project.create({
      data: {
        organizationId: org.id,
        name: 'Concurrency Benchmark Project',
        slug: `concurrency-proj-${Date.now()}`,
      },
    });

    const queue = await prisma.queue.create({
      data: {
        projectId: project.id,
        name: `concurrency-queue-${Date.now()}`,
        concurrencyLimit: 20,
      },
    });

    const worker = await prisma.worker.create({
      data: {
        name: `test-worker-${Date.now()}`,
        hostname: 'localhost',
        processId: process.pid,
      },
    });

    queueId = queue.id;
    workerId = worker.id;

    // 2. Enqueue EXACTLY 10 QUEUED jobs with varying priorities
    for (let i = 0; i < 10; i++) {
      await prisma.job.create({
        data: {
          queueId,
          type: 'email.send',
          payload: { recipient: `user-${i}@example.com`, index: i },
          priority: i % 3, // Priority 0, 1, 2
          status: 'QUEUED',
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('claims exactly 10 distinct jobs with 0 double-claiming across 20 concurrent callers', async () => {
    // 3. Fire 20 parallel concurrent calls to claimNextJob
    const claimPromises = Array.from({ length: 20 }, () =>
      claimNextJob(queueId, workerId)
    );

    const results = await Promise.all(claimPromises);

    // 4. Analyze results
    const claimedJobs = results.filter((j) => j !== null);
    const nullClaims = results.filter((j) => j === null);

    // Assertion 1: Exactly 10 claims succeeded (one for each available job)
    expect(claimedJobs.length).toBe(10);

    // Assertion 2: Remaining 10 calls returned null (queue emptied atomically)
    expect(nullClaims.length).toBe(10);

    // Assertion 3: Exactly 10 distinct job IDs were claimed (ZERO duplicates / ZERO double-claims)
    const claimedJobIds = claimedJobs.map((j) => j!.id);
    const uniqueClaimedIds = new Set(claimedJobIds);

    expect(uniqueClaimedIds.size).toBe(10);

    // Assertion 4: Verify database state
    const dbJobs = await prisma.job.findMany({
      where: { queueId },
    });

    expect(dbJobs.length).toBe(10);
    const allClaimedInDb = dbJobs.every(
      (j) => j.status === 'CLAIMED' && j.lockedByWorkerId === workerId
    );
    expect(allClaimedInDb).toBe(true);

    console.log('\n======================================================');
    console.log('✅ CONCURRENCY TEST PASSED AGAINST REAL POSTGRESQL');
    console.log(`• Concurrent Workers Polling: 20`);
    console.log(`• Total Available Jobs in Queue: 10`);
    console.log(`• Successfully Claimed Jobs: ${claimedJobs.length}`);
    console.log(`• Empty Queue Signals (null): ${nullClaims.length}`);
    console.log(`• Distinct Claimed Job UUIDs: ${uniqueClaimedIds.size} / 10`);
    console.log(`• Duplicate Claims: 0`);
    console.log('======================================================\n');
  });
});
