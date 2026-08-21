import { prisma, WorkerStatus, reapStaleJobs } from '@job-scheduler/shared';
import {
  registerWorkerNode,
  touchWorkerHeartbeat,
  updateWorkerStatus,
  deregisterWorkerNode,
} from './identity';
import { WorkerPoller } from './poller';

async function bootstrap() {
  console.log(`🚀 [Worker Service] Starting daemon initialization...`);

  // Verify database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log(`✅ [Worker Service] Connected to PostgreSQL via shared Prisma client`);
  } catch (err: any) {
    console.error(`💥 [Worker Service] Database connection error: ${err.message}`);
    process.exit(1);
  }

  // 1. Register Worker Node Identity
  const identity = await registerWorkerNode('worker');

  // 2. Parse Environment Configuration
  const targetQueueIds = process.env.QUEUE_IDS
    ? process.env.QUEUE_IDS.split(',').map((id) => id.trim()).filter(Boolean)
    : undefined;

  const maxConcurrency = process.env.WORKER_CONCURRENCY
    ? parseInt(process.env.WORKER_CONCURRENCY, 10)
    : 5;

  const pollIntervalMs = process.env.POLL_INTERVAL_MS
    ? parseInt(process.env.POLL_INTERVAL_MS, 10)
    : 500;

  const shutdownTimeoutMs = process.env.SHUTDOWN_TIMEOUT_MS
    ? parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10)
    : 10000;

  // 3. Start Heartbeat Loop for Worker Node (every 10 seconds)
  const heartbeatInterval = setInterval(async () => {
    await touchWorkerHeartbeat(identity.id);
  }, 10000);

  // 4. Start Background Stale Lock Reaper Sweep (every 15 seconds)
  const reaperInterval = setInterval(async () => {
    try {
      const reaped = await reapStaleJobs();
      if (reaped > 0) {
        console.log(`🧹 [Worker Reaper] Reaped ${reaped} stale/expired job(s) from crashed workers.`);
      }
    } catch (err: any) {
      console.error(`⚠️ [Worker Reaper] Stale job reaper error: ${err.message}`);
    }
  }, 15000);

  // 5. Initialize and Start Polling Engine
  const poller = new WorkerPoller({
    workerId: identity.id,
    targetQueueIds,
    maxWorkerConcurrency: maxConcurrency,
    pollIntervalMs,
  });

  poller.start();

  console.log(`🟢 [Worker Service] Daemon running as '${identity.name}' (ID: ${identity.id})`);

  // 6. Graceful Shutdown Signal Handlers (SIGINT / SIGTERM)
  let isShuttingDown = false;

  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n⚠️ [Worker Service] Received ${signal}. Initiating graceful shutdown...`);

    // Stop heartbeat touch & reaper loops
    clearInterval(heartbeatInterval);
    clearInterval(reaperInterval);

    // Stop Poller from claiming new jobs & mark worker DRAINING
    await poller.stop();
    await updateWorkerStatus(identity.id, WorkerStatus.DRAINING);

    const shutdownStartTime = Date.now();

    // Wait for in-flight active jobs to complete
    while (poller.getActiveJobsCount() > 0 && Date.now() - shutdownStartTime < shutdownTimeoutMs) {
      console.log(
        `⏳ [Worker Shutdown] Waiting for ${poller.getActiveJobsCount()} active job(s) to drain (${Math.round(
          (shutdownTimeoutMs - (Date.now() - shutdownStartTime)) / 1000
        )}s remaining)...`
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (poller.getActiveJobsCount() > 0) {
      console.warn(
        `⚠️ [Worker Shutdown] Shutdown timeout reached with ${poller.getActiveJobsCount()} job(s) in-flight. Abandoning remaining jobs to stale reaper.`
      );
    } else {
      console.log(`✅ [Worker Shutdown] All in-flight jobs drained successfully.`);
    }

    // Set Worker status OFFLINE and disconnect DB
    await deregisterWorkerNode(identity.id);
    await prisma.$disconnect();

    console.log(`👋 [Worker Service] Process exiting cleanly.`);
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error(`💥 [Worker Service] Fatal initialization error:`, err);
  process.exit(1);
});

