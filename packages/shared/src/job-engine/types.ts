import { JobStatus, RetryStrategy, LogLevel } from '@prisma/client';

export class InvalidStateTransitionError extends Error {
  constructor(public currentStatus: JobStatus, public targetStatus: JobStatus, public jobId: string) {
    super(`Invalid job state transition for job ${jobId}: '${currentStatus}' -> '${targetStatus}'`);
    this.name = 'InvalidStateTransitionError';
  }
}

export class JobNotFoundError extends Error {
  constructor(public jobId: string) {
    super(`Job with ID '${jobId}' not found`);
    this.name = 'JobNotFoundError';
  }
}

export class DuplicateJobError extends Error {
  constructor(public idempotencyKey: string) {
    super(`Job with idempotency key '${idempotencyKey}' already exists`);
    this.name = 'DuplicateJobError';
  }
}

export interface TransitionLogOptions {
  level?: LogLevel;
  message?: string;
  meta?: Record<string, any>;
}

export interface ClaimOptions {
  lockDurationSec?: number;
}

export interface RetryCalculationResult {
  delaySec: number;
  scheduledAt: Date;
  attemptsExhausted: boolean;
}
