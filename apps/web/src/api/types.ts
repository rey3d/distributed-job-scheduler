export type JobStatus =
  | 'QUEUED'
  | 'SCHEDULED'
  | 'CLAIMED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type WorkerStatus = 'ONLINE' | 'BUSY' | 'DRAINING' | 'OFFLINE';

export type ExecutionStatus = 'RUNNING' | 'SUCCESS' | 'FAILED';

export type DLQStatus = 'UNRESOLVED' | 'RESOLVED' | 'DISCARDED';

export interface User {
  id: string;
  email: string;
  name?: string;
  organizationId?: string;
  role?: string;
  createdAt?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  token?: string;
  organization?: Organization;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
}

export interface QueueLiveCounts {
  queued: number;
  running: number;
  failed: number;
}

export interface Queue {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  priority: number;
  concurrencyLimit: number;
  paused: boolean;
  retryPolicyId?: string;
  liveCounts?: QueueLiveCounts;
  createdAt: string;
  updatedAt: string;
  _count?: {
    jobs: number;
  };
}

export interface QueueStats {
  queueId: string;
  timeWindow: string;
  jobsCompleted24h: number;
  jobsFailed24h: number;
  successRate: number;
  avgDurationMs: number;
  currentThroughput: number;
  dlqCount: number;
}

export interface JobExecution {
  id: string;
  jobId: string;
  workerId: string;
  attempt: number;
  status: ExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  result?: any;
  error?: any;
}

export interface JobLog {
  id: string;
  jobId: string;
  executionId?: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  meta?: any;
  timestamp: string;
}

export interface Job {
  id: string;
  queueId: string;
  type: string;
  status: JobStatus;
  priority: number;
  payload: any;
  result?: any;
  error?: any;
  maxAttempts: number;
  attemptCount: number;
  scheduledAt: string;
  claimedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  lockedByWorkerId?: string;
  lockExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
  queue?: Queue;
  executions?: JobExecution[];
  logs?: JobLog[];
}

export interface Worker {
  id: string;
  name: string;
  hostname: string;
  processId: number;
  status: WorkerStatus;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  activeExecutions?: JobExecution[];
}

export interface DeadLetterJob {
  id: string;
  originalJobId: string;
  queueId: string;
  failedAt: string;
  lastError: any;
  totalAttempts: number;
  payload: any;
  status: DLQStatus;
  createdAt: string;
  queue?: Queue;
  originalJob?: Job;
}

export interface DashboardSummary {
  activeQueues: number;
  pendingJobs: number;
  completedToday: number;
  deadLetterCount?: number;
  deadLetterJobs?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
