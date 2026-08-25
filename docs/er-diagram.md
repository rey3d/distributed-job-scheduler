# Database Entity-Relationship (ER) Diagram & Schema Evolution

This document details the PostgreSQL schema for the **Distributed Job Scheduling Platform** defined in `packages/shared/prisma/schema.prisma`.

---

## 1. Entity-Relationship Diagram

```mermaid
erDiagram
    Organization ||--o{ User : "has members"
    Organization ||--o{ Project : "owns projects"
    Project ||--o{ Queue : "contains queues"
    Queue }o--o| RetryPolicy : "uses retry strategy"
    Queue ||--o{ Job : "holds jobs"
    Queue ||--o{ ScheduledJob : "defines cron or delayed runs"
    Queue ||--o{ Batch : "groups batch submissions"
    Queue ||--o{ DeadLetterJob : "holds DLQ entries"
    Batch ||--o{ Job : "contains jobs"
    Job ||--o{ JobExecution : "records execution history"
    Job ||--o{ JobLog : "generates audit logs"
    Job ||--o{ WorkerHeartbeat : "currently processing"
    Job }o--o| Worker : "locked by worker"
    Job ||--o| DeadLetterJob : "original job"
    JobExecution ||--o{ JobLog : "attempt logs"
    Worker ||--o{ WorkerHeartbeat : "sends heartbeats"
    Worker ||--o{ JobExecution : "executes jobs"

    Organization {
        uuid id PK
        string name
        string slug UK
        datetime createdAt
        datetime updatedAt
    }

    User {
        uuid id PK
        string email UK
        string passwordHash
        enum role "OWNER | ADMIN | MEMBER"
        uuid organizationId FK
        datetime createdAt
        datetime updatedAt
    }

    Project {
        uuid id PK
        uuid organizationId FK
        string name
        string slug
        datetime createdAt
        datetime updatedAt
    }

    Queue {
        uuid id PK
        uuid projectId FK
        uuid retryPolicyId FK
        string name
        string description
        int priority
        int concurrencyLimit
        boolean paused
        datetime createdAt
        datetime updatedAt
    }

    RetryPolicy {
        uuid id PK
        string name
        enum strategy "FIXED | LINEAR | EXPONENTIAL"
        int baseDelaySec
        int maxAttempts
        int maxDelayCapSec
        datetime createdAt
        datetime updatedAt
    }

    Job {
        uuid id PK
        uuid queueId FK
        uuid batchId FK
        string type
        enum status "QUEUED | SCHEDULED | CLAIMED | RUNNING | COMPLETED | FAILED | CANCELLED"
        int priority
        json payload
        int maxAttempts
        int attemptCount
        datetime scheduledAt
        datetime claimedAt
        datetime startedAt
        datetime finishedAt
        uuid lockedByWorkerId FK
        datetime lockExpiresAt
        string idempotencyKey UK
        datetime createdAt
        datetime updatedAt
    }

    JobExecution {
        uuid id PK
        uuid jobId FK
        uuid workerId FK
        int attempt
        enum status "RUNNING | SUCCESS | FAILED"
        datetime startedAt
        datetime finishedAt
        int durationMs
        json result
        json error
    }

    JobLog {
        uuid id PK
        uuid jobId FK
        uuid executionId FK
        enum level "INFO | WARN | ERROR | DEBUG"
        string message
        json meta
        datetime timestamp
    }

    ScheduledJob {
        uuid id PK
        uuid queueId FK
        string name
        string jobType
        json payload
        string cronExpression
        datetime nextRunAt
        datetime lastRunAt
        boolean enabled
    }

    Batch {
        uuid id PK
        uuid queueId FK
        int totalJobs
        datetime createdAt
    }

    Worker {
        uuid id PK
        string name
        string hostname
        int processId
        enum status "ONLINE | BUSY | DRAINING | OFFLINE"
        int concurrencyLimit
        int activeJobsCount
        datetime lastSeenAt
    }

    WorkerHeartbeat {
        uuid id PK
        uuid workerId FK
        uuid currentJobId FK
        json metrics
        datetime timestamp
    }

    DeadLetterJob {
        uuid id PK
        uuid originalJobId FK UK
        uuid queueId FK
        datetime failedAt
        json lastError
        int totalAttempts
        json payload
        enum status "UNRESOLVED | RETRIED | DISCARDED"
    }
```

---

## 2. Keys, Indexes, Cascades, and Performance

1. **Primary keys**: Every entity uses a UUID primary key (`@default(uuid())`) so workers, APIs, and the dashboard can share identifiers without a central sequence.
2. **Foreign keys & cascading**:
   - `Organization → User/Project` cascade delete (tenant wipe).
   - `Project → Queue → Job/ScheduledJob/Batch/DLQ` cascade delete.
   - `RetryPolicy` uses `onDelete: SetNull` on queues so policy rows can be reused.
   - `Worker` locks on jobs use `onDelete: SetNull` so worker deregistration does not delete jobs.
3. **Normalization**: Retry math lives in `RetryPolicy` (3NF) rather than duplicating strategy fields on every job. Execution attempts are a child table (`JobExecution`) instead of mutating a single job row. Recurring definitions are `ScheduledJob`; one-shot delayed jobs use `Job.scheduledAt`.
4. **Hot-path indexes**:
   - `idx_jobs_claim_hotpath` `(queueId, status, scheduledAt, priority DESC, createdAt ASC)` for `FOR UPDATE SKIP LOCKED`.
   - `idx_jobs_stale_claim_recovery` `(status, lockExpiresAt)` for crashed-worker reaping.
   - `idx_scheduled_jobs_next_run` `(enabled, nextRunAt)` for cron dispatch.
   - `idx_dlq_queue_status` for dashboard DLQ lists.
5. **Uniqueness**: `organizations.slug`, `users.email`, `(organizationId, slug)` on projects, `(projectId, name)` on queues, and `jobs.idempotencyKey` prevent duplicates under concurrent writers.

---

## 3. Schema Design Evolution & Key Choices

1. **Multi-Tenant Isolation**: `Organization` is the tenancy boundary. API access is scoped by `organizationId` from the JWT rather than separate physical schemas.
2. **Idempotency Key Deduplication**: `Job.idempotencyKey` has a database unique constraint so concurrent enqueue retries cannot create two runnable rows.
3. **Atomic Claiming Indexing**: Claim queries stay index-backed so `SKIP LOCKED` remains cheap as backlog grows.
4. **Execution Audit & Logs**: Immutable `JobExecution` rows hold retry history, worker assignment, duration, and result/error. `JobLog` is the append-only timeline for state transitions and handler messages.
