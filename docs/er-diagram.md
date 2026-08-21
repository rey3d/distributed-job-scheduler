# Database Entity-Relationship (ER) Diagram & Schema Evolution

This document details the PostgreSQL schema for the **Distributed Job Scheduling Platform** defined in `packages/shared/prisma/schema.prisma`.

---

## 1. Entity-Relationship Diagram

```mermaid
erDiagram
    Organization ||--o{ User : "has members"
    Organization ||--o{ Project : "owns projects"

    Project ||--o{ Queue : "contains queues"
    Project ||--o{ Tag : "owns tags"

    Queue }|--|| RetryPolicy : "uses retry strategy"
    Queue ||--o{ Job : "holds jobs"
    Queue ||--o{ DeadLetterJob : "holds DLQ entries"

    Job ||--o{ JobExecution : "records execution history"
    Job ||--o{ JobLog : "generates audit logs"
    Job ||--o{ WorkerHeartbeat : "currently processing"
    Job }|--o| Worker : "locked by worker"
    Job }|--o| DeadLetterJob : "original job"

    Worker ||--o{ WorkerHeartbeat : "sends heartbeats"
    Worker ||--o{ JobExecution : "executes jobs"

    Job ||--o{ _JobToTag : "tagged with"
    Tag ||--o{ _JobToTag : "applies to"

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
        string role
        uuid organizationId FK
        datetime createdAt
        datetime updatedAt
    }

    Project {
        uuid id PK
        uuid organizationId FK
        string name
        string slug UK
        datetime createdAt
        datetime updatedAt
    }

    Queue {
        uuid id PK
        uuid projectId FK
        string name
        string description
        int priority
        int concurrencyLimit
        boolean paused
        uuid retryPolicyId FK
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
        enum level "INFO | WARN | ERROR"
        string message
        json meta
        datetime timestamp
    }

    Worker {
        uuid id PK
        string name
        string hostname
        int processId
        enum status "ONLINE | BUSY | DRAINING | OFFLINE"
        datetime lastSeenAt
        datetime createdAt
        datetime updatedAt
    }

    WorkerHeartbeat {
        uuid id PK
        uuid workerId FK
        uuid currentJobId FK
        json systemMetrics
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
        enum status "UNRESOLVED | RESOLVED | DISCARDED"
        datetime createdAt
    }

    Tag {
        uuid id PK
        uuid projectId FK
        string name
        string color
    }
```

---

## 2. Schema Design Evolution & Key Choices

1. **Multi-Tenant Isolation**:
   - `Organization` sits at the top of the hierarchy. All data accesses (`User`, `Project`, `Queue`, `Job`) enforce strict tenant scoping (`organizationId`) at the API and database levels.
2. **Idempotency Key Deduplication**:
   - The `idempotencyKey` field on `Job` has a database-level `UNIQUE` constraint, allowing callers to safely retry enqueuing operations without risking duplicate job records.
3. **Atomic Claiming Indexing**:
   - High-throughput composite index on `Job`: `(queueId, status, priority DESC, createdAt ASC)` ensures `SELECT FOR UPDATE SKIP LOCKED` queries execute in sub-millisecond time.
4. **Execution Audit & Logs**:
   - Distinct separation between immutable execution records (`JobExecution`) and event audit logs (`JobLog`), preserving diagnostic state for every attempt even when jobs are retried or moved to the Dead Letter Queue.
