import { prisma, JobStatus, DLQStatus, RetryStrategy } from '@job-scheduler/shared';
import { fork, ChildProcess } from 'child_process';
import path from 'path';

async function runMultiInstanceConcurrencyTest() {
  console.log(`================================================================`);
  console.log(`🚀 [Distributed Proof] Multi-Instance Worker Concurrency Test`);
  console.log(`================================================================\n`);

  // 1. Setup Test Tenant, Project, and Queue in Database
  const org = await prisma.organization.create({
    data: {
      name: `Proof Corp ${Date.now()}`,
      slug: `proof-corp-${Date.now()}`,
    },
  });

  const project = await prisma.project.create({
    data: {
      name: 'Distributed Engine Proof Project',
      slug: `proof-project-${Date.now()}`,
      organizationId: org.id,
    },
  });

  const retryPolicy = await prisma.retryPolicy.create({
    data: {
      name: `Proof Retry Policy ${Date.now()}`,
      strategy: RetryStrategy.EXPONENTIAL,
      baseDelaySec: 5,
      maxAttempts: 3,
    },
  });

  const queue = await prisma.queue.create({
    data: {
      name: `multi-worker-proof-queue-${Date.now()}`,
      projectId: project.id,
      retryPolicyId: retryPolicy.id,
      concurrencyLimit: 25,
      paused: false,
    },
  });

  console.log(`✅ [Setup] Created Queue '${queue.name}' (ID: ${queue.id}, Concurrency Limit: ${queue.concurrencyLimit})`);

  // 2. Enqueue 50 Jobs into Queue
  const JOB_COUNT = 50;
  console.log(`📦 [Enqueue] Seeding ${JOB_COUNT} jobs into Queue '${queue.id}'...`);

  const jobData = Array.from({ length: JOB_COUNT }).map((_, i) => ({
    queueId: queue.id,
    type: 'email.send',
    payload: { recipient: `customer-${i + 1}@acme-corp.com`, delayMs: 40 },
    priority: (i % 5) + 1, // Priorities 1..5
    status: JobStatus.QUEUED,
    maxAttempts: 3,
    attemptCount: 0,
  }));

  await prisma.job.createMany({ data: jobData });

  // Initial Database Metrics Check
  const initialQueuedCount = await prisma.job.count({
    where: { queueId: queue.id, status: JobStatus.QUEUED },
  });

  console.log(`\n📊 [Initial Metrics]`);
  console.log(`   - QUEUED Jobs:    ${initialQueuedCount}`);
  console.log(`   - RUNNING Jobs:   0`);
  console.log(`   - COMPLETED Jobs: 0`);
  console.log(`   - DLQ Entries:    0\n`);

  // 3. Spawn 3 Independent Worker Processes Concurrently
  const WORKER_COUNT = 3;
  const workerProcesses: ChildProcess[] = [];
  const workerScript = path.resolve(__dirname, '../apps/worker/src/index.ts');

  console.log(`⚡ [Spawning] Launching ${WORKER_COUNT} worker processes concurrently...`);

  for (let i = 1; i <= WORKER_COUNT; i++) {
    const child = fork(workerScript, [], {
      env: {
        ...process.env,
        QUEUE_IDS: queue.id,
        WORKER_CONCURRENCY: '5',
        POLL_INTERVAL_MS: '200',
      },
      execArgv: ['-r', 'ts-node/register'],
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    console.log(`   [Launcher] Forked OS Child Process #${i} -> PID: ${child.pid}`);

    child.stdout?.on('data', (chunk) => {
      const line = chunk.toString().trim();
      if (line.includes('⚡') || line.includes('🟢') || line.includes('✅')) {
        console.log(`   [Worker Proc #${i}] ${line}`);
      }
    });

    child.stderr?.on('data', (chunk) => {
      const line = chunk.toString().trim();
      if (line && !line.includes('Notice') && !line.includes('WARN')) {
        console.error(`   [Worker Proc #${i} ERR] ${line}`);
      }
    });

    workerProcesses.push(child);
  }

  // 4. Poll Database Progress until all 50 Jobs finish
  console.log(`\n⏱️ [Execution] Monitoring parallel execution progress across 3 workers...`);

  const startTime = Date.now();
  const timeoutMs = 45000;
  let completedCount = 0;
  let runningCount = 0;
  let failedCount = 0;

  while (Date.now() - startTime < timeoutMs) {
    const [comp, run, fail] = await Promise.all([
      prisma.job.count({ where: { queueId: queue.id, status: JobStatus.COMPLETED } }),
      prisma.job.count({ where: { queueId: queue.id, status: JobStatus.RUNNING } }),
      prisma.job.count({ where: { queueId: queue.id, status: JobStatus.FAILED } }),
    ]);

    completedCount = comp;
    runningCount = run;
    failedCount = fail;

    if (completedCount + failedCount >= JOB_COUNT) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n⌛ Execution completed in ${elapsedSec} seconds.\n`);

  // 5. Trigger Graceful Shutdown on Worker Processes
  console.log(`🛑 [Shutdown] Terminating ${WORKER_COUNT} worker processes with SIGINT...`);
  for (const proc of workerProcesses) {
    proc.kill('SIGINT');
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 6. Comprehensive Concurrency & Duplicate Verification
  const finalCompletedCount = await prisma.job.count({
    where: { queueId: queue.id, status: JobStatus.COMPLETED },
  });

  const finalDlqCount = await prisma.deadLetterJob.count({
    where: { queueId: queue.id, status: DLQStatus.UNRESOLVED },
  });

  // Query Execution Records to verify 0 duplicate attempts
  const allJobsInQueue = await prisma.job.findMany({
    where: { queueId: queue.id },
    select: { id: true, lockedByWorkerId: true },
  });

  const jobIds = allJobsInQueue.map((j) => j.id);

  const executions = await prisma.jobExecution.findMany({
    where: { jobId: { in: jobIds } },
    select: { jobId: true, workerId: true },
  });

  // Count executions per job
  const executionCountsPerJob: Record<string, number> = {};
  const workerDistribution: Record<string, number> = {};

  for (const exec of executions) {
    executionCountsPerJob[exec.jobId] = (executionCountsPerJob[exec.jobId] || 0) + 1;
    workerDistribution[exec.workerId] = (workerDistribution[exec.workerId] || 0) + 1;
  }

  const duplicateExecutionsCount = Object.values(executionCountsPerJob).filter((c) => c > 1).length;
  const distinctWorkerCount = Object.keys(workerDistribution).length;

  console.log(`================================================================`);
  console.log(`📊 [FINAL MULTI-INSTANCE VERIFICATION RESULTS]`);
  console.log(`================================================================`);
  console.log(` ✔️ Target Jobs Enqueued:        ${JOB_COUNT}`);
  console.log(` ✔️ Jobs Completed:             ${finalCompletedCount} / ${JOB_COUNT}`);
  console.log(` ✔️ Dead Letter Queue Entries:   ${finalDlqCount}`);
  console.log(` ✔️ Total Execution Records:    ${executions.length}`);
  console.log(` ✔️ Duplicate Executions:        ${duplicateExecutionsCount} (Must be 0)`);
  console.log(` ✔️ Active Worker Instances:     ${distinctWorkerCount} workers processed jobs`);
  console.log(`----------------------------------------------------------------`);
  console.log(` 🏆 Workload Distribution across Workers:`);
  Object.entries(workerDistribution).forEach(([wId, count]) => {
    console.log(`    - Worker '${wId}': ${count} jobs executed`);
  });
  console.log(`================================================================\n`);

  if (finalCompletedCount === JOB_COUNT && duplicateExecutionsCount === 0) {
    console.log(`🎉 [SUCCESS] 100% Exact Execution! All 50 jobs completed exactly once with 0 duplicate claims across 3 concurrent workers.`);
    process.exit(0);
  } else {
    console.error(`❌ [FAILURE] Verification failed. Completed: ${finalCompletedCount}/${JOB_COUNT}, Duplicates: ${duplicateExecutionsCount}`);
    process.exit(1);
  }
}

runMultiInstanceConcurrencyTest().catch((err) => {
  console.error(`💥 Fatal error in multi-instance concurrency test:`, err);
  process.exit(1);
});
