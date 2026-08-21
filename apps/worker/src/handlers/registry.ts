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

  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
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
 * Note: These handlers simulate realistic background workloads (latency + success/failure side effects)
 * for testing and demonstration purposes in place of external third-party integrations.
 */

// 1. Email Notification Handler
defaultRegistry.register('email.send', async (payload: any) => {
  const delayMs = payload?.delayMs ?? 100;
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  if (payload?.simulateFailure) {
    throw new Error(`SMTP Provider Connection Refused: ${payload?.recipient || 'unknown@domain.com'}`);
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

  if (payload?.simulateFailure || (payload?.amount !== undefined && payload?.amount <= 0)) {
    throw new Error(`Payment Gateway Authorization Failure: Card Declined for amount $${payload?.amount ?? 0}`);
  }

  return {
    charged: true,
    amount: payload?.amount ?? 99.99,
    currency: payload?.currency || 'USD',
    transactionRef: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    timestamp: new Date().toISOString(),
  };
});

// 3. Payment Processing Handler (Alias & Dedicated Payment Handler)
defaultRegistry.register('payment.process', async (payload: any, job: Job) => {
  const delayMs = payload?.delayMs ?? 120;
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  if (payload?.simulateFailure) {
    throw new Error(`Payment Gateway Service Unavailable for transaction on job '${job.id}'`);
  }

  return {
    status: 'APPROVED',
    transactionId: `pay-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    amount: payload?.amount ?? 149.99,
    currency: payload?.currency || 'USD',
    timestamp: new Date().toISOString(),
  };
});

defaultRegistry.register('payment.charge', async (payload: any, job: Job) => {
  const handler = defaultRegistry['handlers'].get('billing.charge');
  if (handler) return handler(payload, job);
  return { charged: true };
});

// 4. Data Processing & ETL Batch Handler
defaultRegistry.register('data.process', async (payload: any) => {
  const delayMs = payload?.delayMs ?? 100;
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  if (payload?.simulateFailure) {
    throw new Error(`ETL Transformation Exception: Parsing failed for file '${payload?.file || 'batch.csv'}'`);
  }

  return {
    processed: true,
    recordsCount: payload?.recordsCount ?? 1500,
    batchId: `batch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    completedAt: new Date().toISOString(),
  };
});

// 5. Database Snapshot & Backup Handler
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

// 6. Generic Custom Task Handler
defaultRegistry.register('custom.task', async (payload: any) => {
  const delayMs = payload?.delayMs ?? 50;
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  if (payload?.simulateFailure) {
    throw new Error(`Custom Task Runtime Exception: ${payload?.errorMessage || 'Task execution failed'}`);
  }

  return {
    executed: true,
    result: payload?.data || 'Task completed successfully',
    timestamp: new Date().toISOString(),
  };
});
