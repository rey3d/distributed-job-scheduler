import {
  prisma,
  claimNextJob,
  JobStatus,
  WorkerStatus,
} from '@job-scheduler/shared';
import { updateWorkerStatus } from './identity';
import { processClaimedJob } from './runner';
import { JobHandlerRegistry, defaultRegistry } from './handlers/registry';

export interface PollerOptions {
  workerId: string;
  targetQueueIds?: string[];
  maxWorkerConcurrency?: number;
  pollIntervalMs?: number;
  registry?: JobHandlerRegistry;
}

export class WorkerPoller {
  private workerId: string;
  private targetQueueIds?: string[];
  private maxWorkerConcurrency: number;
  private pollIntervalMs: number;
  private registry: JobHandlerRegistry;

  private isRunning = false;
  private isDraining = false;
  private activeJobsCount = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: PollerOptions) {
    this.workerId = options.workerId;
    this.targetQueueIds = options.targetQueueIds;
    this.maxWorkerConcurrency = options.maxWorkerConcurrency || 5;
    this.pollIntervalMs = options.pollIntervalMs || 500;
    this.registry = options.registry || defaultRegistry;
  }

  getActiveJobsCount(): number {
    return this.activeJobsCount;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isDraining = false;
    console.log(
      `⚙️ [Poller ${this.workerId}] Started loop (Interval: ${this.pollIntervalMs}ms, Max Worker Slots: ${this.maxWorkerConcurrency})`
    );

    this.scheduleNextTick(0);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.isDraining = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log(`⏳ [Poller ${this.workerId}] Stopped polling loop. Draining ${this.activeJobsCount} in-flight jobs...`);
  }

  private scheduleNextTick(delayMs: number) {
    if (!this.isRunning || this.isDraining) return;
    this.timer = setTimeout(() => {
      this.pollCycle().catch((err) => {
        console.error(`💥 [Poller ${this.workerId}] Uncaught poll cycle error:`, err);
      }).finally(() => {
        this.scheduleNextTick(this.pollIntervalMs);
      });
    }, delayMs);
  }

  private async pollCycle() {
    if (this.isDraining || !this.isRunning) return;

    // Check if worker has free local concurrency slots
    if (this.activeJobsCount >= this.maxWorkerConcurrency) {
      return;
    }

    // Resolve active non-paused queues to service
    const whereClause: any = { paused: false };
    if (this.targetQueueIds && this.targetQueueIds.length > 0) {
      whereClause.id = { in: this.targetQueueIds };
    }

    const queues = await prisma.queue.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        concurrencyLimit: true,
        paused: true,
      },
    });

    if (queues.length === 0) {
      return;
    }

    for (const queue of queues) {
      if (this.activeJobsCount >= this.maxWorkerConcurrency || this.isDraining) {
        break;
      }

      // Check Queue Concurrency Limit in Database
      const currentRunningInQueue = await prisma.job.count({
        where: {
          queueId: queue.id,
          status: JobStatus.RUNNING,
        },
      });

      if (currentRunningInQueue >= queue.concurrencyLimit) {
        // Queue level concurrency limit reached, skip this queue in current tick
        continue;
      }

      // Attempt atomic job claim using SKIP LOCKED
      const claimedJob = await claimNextJob(queue.id, this.workerId);

      if (claimedJob) {
        this.activeJobsCount++;
        await updateWorkerStatus(this.workerId, WorkerStatus.BUSY);

        // Run claimed job asynchronously
        processClaimedJob(claimedJob, this.workerId, this.registry)
          .catch((err) => {
            console.error(`💥 Execution runner error on job '${claimedJob.id}':`, err);
          })
          .finally(async () => {
            this.activeJobsCount--;
            if (this.activeJobsCount === 0 && !this.isDraining) {
              await updateWorkerStatus(this.workerId, WorkerStatus.ONLINE);
            }
          });
      }
    }
  }
}
