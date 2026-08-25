# System Architecture & Flow Documentation

This document outlines the distributed architecture, component interactions, database coordination model, job lifecycle state machine, and horizontal scaling strategies of the **Distributed Job Scheduling Platform**.

---

## 1. System Components & Communications Topology

```mermaid
flowchart TB
    subgraph Clients["Clients & Frontend"]
        WebDashboard["React Web Dashboard (apps/web)"]
        ExternalAPI["Third-Party API Clients / Webhooks"]
    end

    subgraph APILayer["REST API Layer (apps/api)"]
        NestServer["NestJS Server Node (Port 3001)"]
        AuthModule["Auth & JWT Guard"]
        OrgModule["Multi-Tenant Isolation"]
        JobModule["Job Enqueuing & Query Engine"]
    end

    subgraph SharedCore["Shared Engine (@job-scheduler/shared)"]
        StateMachine["State Machine Rules"]
        AtomicClaim["Atomic Claim Engine (FOR UPDATE SKIP LOCKED)"]
        HeartbeatEngine["Heartbeat & Lock Maintenance"]
        StaleReaper["Crashed Worker Lock Reaper"]
        RetryEngine["Retry & Backoff Math"]
    end

    subgraph DatabaseLayer["Data & Coordination Layer"]
        PostgreSQL[("PostgreSQL Database (Port 5432)")]
    end

    subgraph WorkerFleet["Distributed Worker Daemon Fleet (apps/worker)"]
        Worker1["Worker Instance #1 (Node Process PID A)"]
        Worker2["Worker Instance #2 (Node Process PID B)"]
        WorkerN["Worker Instance #N (Node Process PID N)"]
    end

    WebDashboard -->|HTTPS / REST API| NestServer
    ExternalAPI -->|HTTPS / REST API| NestServer

    NestServer --> AuthModule
    AuthModule --> OrgModule
    OrgModule --> JobModule
    JobModule --> SharedCore

    Worker1 --> SharedCore
    Worker2 --> SharedCore
    WorkerN --> SharedCore

    SharedCore <-->|Prisma ORM & Raw SQL| PostgreSQL
```

---

## 2. End-to-End Job Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Client as API Client / Web Dashboard
    participant API as NestJS REST API
    participant DB as PostgreSQL Database
    participant Engine as Job Engine Core
    participant Worker as Worker Daemon Instance
    participant DLQ as Dead Letter Queue Table

    Client->>API: POST /queues/:id/jobs (Payload, Priority, MaxAttempts)
    API->>Engine: enqueueJobWithIdempotency()
    Engine->>DB: INSERT INTO jobs (status='QUEUED', idempotencyKey)
    DB-->>API: Job Record Created (UUID)
    API-->>Client: 201 Created { job: { id, status: 'QUEUED' } }

    loop Worker Polling Loop (Interval: 200ms)
        Worker->>Engine: promoteDueScheduledJobs()
        Engine->>DB: UPDATE jobs SET status='QUEUED' WHERE status='SCHEDULED' AND scheduledAt<=NOW()
        Worker->>Engine: claimNextJob(queueId, workerId)
        Engine->>DB: UPDATE jobs SET status='CLAIMED', lockExpiresAt=NOW()+30s WHERE id = (SELECT id FROM jobs WHERE queueId=:id AND status='QUEUED' AND paused=false ORDER BY priority DESC, createdAt ASC FOR UPDATE OF jobs SKIP LOCKED LIMIT 1)
        DB-->>Worker: Claimed Job Row (or null if empty/paused)
    end

    alt Execution Success
        Worker->>Engine: transitionJobState(jobId, 'RUNNING')
        Worker->>Worker: Execute Handler ('email.send' / 'billing.charge')
        Worker->>Engine: transitionJobState(jobId, 'COMPLETED')
        Worker->>DB: INSERT INTO job_executions (status='SUCCESS', durationMs)
    else Execution Failure (Attempts < MaxAttempts)
        Worker->>Worker: Handler throws exception
        Worker->>Engine: calculateNextRetryDelay(attempt, strategy)
        Worker->>Engine: transitionJobState(jobId, 'SCHEDULED') -> scheduledAt = NOW() + delay
        Worker->>DB: INSERT INTO job_executions (status='FAILED')
    else Execution Failure (Attempts >= MaxAttempts)
        Worker->>Worker: Max attempts reached
        Worker->>Engine: transitionJobState(jobId, 'FAILED')
        Worker->>DLQ: INSERT INTO dead_letter_jobs (status='UNRESOLVED')
    end
```

---

## 3. Horizontal Scaling & High-Concurrency Guarantees

1. **Database as Single Source of Truth**:
   - PostgreSQL acts as the atomic coordinator. Row-level locks obtained via `SELECT ... FOR UPDATE SKIP LOCKED` guarantee that multiple independent worker OS processes never double-claim or execute the same job concurrently.
2. **Stateless API & Worker Nodes**:
   - Multiple `apps/api` NestJS instances can sit behind a load balancer.
   - Workers self-register with unique instance UUIDs (`hostname-pid-suffix`) in the `workers` database table and maintain liveness via heartbeat sweeps (`upsertWorkerHeartbeat`).
3. **Crashed Worker Recovery**:
   - If a worker node crashes or loses network connectivity mid-execution, its active lock (`lockExpiresAt`) expires after 30 seconds.
   - The background Reaper process (`reapStaleJobs()`) automatically identifies expired locks, releases the lock, increments `attemptCount`, and returns the job to `QUEUED` status for other healthy workers to claim.
