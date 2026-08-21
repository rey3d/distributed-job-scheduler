import { Job } from '@job-scheduler/shared';

export type JobHandlerFn = (payload: any, job: Job) => Promise<any>;

export class UnknownJobTypeError extends Error {
  constructor(jobType: string) {
    super(`No registered handler found for job type '${jobType}'`);
    this.name = 'UnknownJobTypeError';
  }
}

export class JobHandlerRegistry {
  private handlers = new Map<string, JobHandlerFn>();

  register(jobType: string, handler: JobHandlerFn) {
    this.handlers.set(jobType, handler);
  }

  has(jobType: string): boolean {
    return this.handlers.has(jobType);
  }

  async execute(job: Job): Promise<any> {
    const handler = this.handlers.get(job.type);

    if (!handler) {
      throw new UnknownJobTypeError(job.type);
    }

    return await handler(job.payload, job);
  }
}

export const defaultRegistry = new JobHandlerRegistry();

/**
 * SIMULATED JOB HANDLERS
 * Note: These handlers simulate realistic workloads (latency + success/failure side effects)
 * for testing and demonstration purposes in place of external third-party APIs.
 */

// 1. Email Notification Handler
defaultRegistry.register('email.send', async (payload: any) => {
  const delayMs = payload?.delayMs ?? 100;
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  if (payload?.simulateFailure) {
    throw new Error(`SMTP Provider Connection Refused: ${payload.recipient || 'unknown@domain.com'}`);
  }

  return {
    delivered: true,
    recipient: payload?.recipient || 'user@example.com',
    messageId: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
  };
});

// 2. Billing & Payment Charge Handler
defaultRegistry.register('billing.charge', async (payload: any) => {
  const delayMs = payload?.delayMs ?? 150;
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  if (payload?.simulateFailure || payload?.amount <= 0) {
    throw new Error(`Payment Gateway Authorization Failure: Card Declined for amount $${payload?.amount}`);
  }

  return {
    charged: true,
    amount: payload?.amount ?? 99.99,
    currency: payload?.currency || 'USD',
    transactionRef: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    timestamp: new Date().toISOString(),
  };
});

// 3. Database Snapshot & Backup Handler
defaultRegistry.register('db.backup', async (payload: any) => {
  const delayMs = payload?.delayMs ?? 200;
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  if (payload?.simulateFailure) {
    throw new Error(`Storage Service Outage: Bucket write access denied`);
  }

  return {
    snapshotId: `snap-${Date.now()}`,
    database: payload?.database || 'production_main',
    sizeBytes: 1024 * 1024 * 42,
    completedAt: new Date().toISOString(),
  };
});
