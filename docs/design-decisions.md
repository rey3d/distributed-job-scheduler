# Architectural & Database Design Decisions

This document details the database schema architecture, normalization principles, indexing strategy, foreign key cascades, and concurrency control mechanisms for the **Distributed Job Scheduling Platform**.

---

## 1. Primary Key Strategy: UUID v4 vs Auto-Increment

### Choice: **UUID v4 (`@default(uuid()) @db.Uuid`)**

All 12 entities in the schema utilize 128-bit UUID v4 primary keys (`@db.Uuid` in Prisma / `uuid` in PostgreSQL).

### Rationale:
1. **Multi-Tenant Security & Non-Enumerability**: In a multi-tenant business platform, auto-incrementing integer IDs (`1, 2, 3...`) expose predictable sequences, enabling enumeration attacks (IDOR) where tenants could guess object IDs. UUIDs are cryptographically random and unguessable.
2. **Distributed ID Generation**: API servers and worker nodes can generate unique job, execution, and log identifiers in application memory without roundtrips to the database to request sequence numbers.
3. **Database Sharding & Data Federation**: If job queues are sharded across multiple PostgreSQL database nodes in future phases, UUIDs guarantee global uniqueness without sequence synchronization overhead.
4. **PostgreSQL Native Support**: PostgreSQL stores `db.Uuid` natively as a 16-byte binary structure (not a 36-character string), making B-Tree indexing compact and highly performant.

---

## 2. Foreign Keys & Cascade Behavior

Foreign key relationships enforce strict multi-tenant integrity while ensuring historical worker metrics are never lost due to transient process restarts.

| Parent Model | Child Model | Relationship | Cascade Action | Justification |
| :--- | :--- | :--- | :--- | :--- |
| `Organization` | `User` | 1-to-Many | `ON DELETE CASCADE` | Deleting an organization revokes access for all associated users. |
| `Organization` | `Project` | 1-to-Many | `ON DELETE CASCADE` | Projects belong strictly to a single tenant organization. |
| `Project` | `Queue` | 1-to-Many | `ON DELETE CASCADE` | Queues are scoped to a project boundary. |
| `Queue` | `RetryPolicy` | Many-to-1 | `ON DELETE SET NULL` | Deleting a custom retry policy reverts queues to system default retries without deleting queues or jobs. |
| `Queue` | `Job` | 1-to-Many | `ON DELETE CASCADE` | Deleting a queue purges all active and historical jobs within that queue. |
| `Worker` | `Job` (`lockedByWorkerId`) | 1-to-Many | `ON DELETE SET NULL` | **Crucial**: If a worker node crashes or is deregistered, active jobs are released back to `QUEUED` via background sweeps; the job record must remain. |
| `Worker` | `JobExecution` | 1-to-Many | `ON DELETE SET NULL` | Preserves execution history and performance metrics even when transient worker instances scale down or shut down. |
| `Job` | `JobExecution` | 1-to-Many | `ON DELETE CASCADE` | Deleting a job purges its associated execution attempt history. |
| `Job` | `JobLog` | 1-to-Many | `ON DELETE CASCADE` | Deleting a job purges its line-by-line log output. |
| `JobExecution` | `JobLog` | 1-to-Many | `ON DELETE SET NULL` | Log entries remain linked to the parent Job even if an execution record is pruned. |
| `Job` | `DeadLetterJob` | 1-to-1 | `ON DELETE CASCADE` | Deleting the parent job removes its Dead Letter Queue record. |

---

## 3. Hot Path Indexes

To support thousands of concurrent job claims per second and responsive dashboard filtering, specific composite indexes are defined in `schema.prisma`.

### A. Atomic Job Claim Hot Path Index
```prisma
@@index([queueId, status, scheduledAt, priority(sort: Desc), createdAt(sort: Asc)], name: "idx_jobs_claim_hotpath")
```
- **Target Query**: `SELECT ... FOR UPDATE SKIP LOCKED` executed by worker processes polling a queue.
- **Why**: Worker polling filters by `queueId`, `status = 'QUEUED'`, and `scheduledAt <= NOW()`, ordered by `priority DESC` then `createdAt ASC`. This index enables **Index-Only Scans**, resolving candidate jobs instantaneously without reading unneeded table pages.

### B. Dashboard Job Explorer Index
```prisma
@@index([queueId, status, createdAt(sort: Desc)], name: "idx_jobs_queue_status_created")
@@index([status, createdAt(sort: Desc)], name: "idx_jobs_status_created")
```
- **Target Query**: Paginated job monitoring requests on the web dashboard filtered by status (`QUEUED`, `RUNNING`, `FAILED`) and time range.
- **Why**: Prevents full table scans when users scroll through millions of historical jobs in specific queues.

### C. Stale Claim Recovery Index
```prisma
@@index([status, lockExpiresAt], name: "idx_jobs_stale_claim_recovery")
```
- **Target Query**: Background recovery sweep checking for jobs where `status = 'CLAIMED'` and `lockExpiresAt < NOW()`.
- **Why**: Allows the supervisor daemon to detect crashed workers in `< 1ms`.

---

## 4. Normalization Decisions

### A. Separation of `Jobs` vs `JobExecutions`
- `Jobs` tracks the **current lifecycle state** of a task (priority, aggregate attempt count, current lock, final outcome).
- `JobExecutions` records **every individual attempt** (worker node assigned, start/end time, duration in ms, attempt-specific error payload).
- **Rationale**: Keeps `Jobs` table compact for fast polling. Allows detailed retry auditing and p95/p99 duration tracking across attempts without mutating primary job metadata.

### B. Separation of `JobLogs` from `JobExecutions`
- `JobLogs` stores granular, line-by-line console output (`INFO`, `WARN`, `ERROR`, `DEBUG`) emitted during job processing.
- **Rationale**: Console output can be multi-megabyte streams. Separating logs ensures execution status queries remain lightweight while logs can be streamed asynchronously or archived to S3/cold storage.

### C. `DeadLetterJob` as an Isolated Entity
- Permanently exhausted jobs (after `maxAttempts` retries) are linked to a `DeadLetterJob` table.
- **Rationale**: Isolates dead jobs from the active queue polling path, ensuring the hot `Jobs` table only contains active or recently completed work.

---

## 5. Double-Claiming Prevention & Atomic Locking Strategy

When multiple worker nodes poll the database simultaneously, race conditions can cause two workers to claim the same job, leading to duplicate execution.

### The Solution: PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED`

To eliminate double-claiming natively at the database layer without external locks:

```sql
UPDATE jobs
SET 
  status = 'CLAIMED',
  "claimedAt" = NOW(),
  "lockedByWorkerId" = $1,
  "lockExpiresAt" = NOW() + INTERVAL '30 seconds',
  "updatedAt" = NOW()
WHERE id = (
  SELECT id
  FROM jobs
  WHERE "queueId" = $2
    AND status = 'QUEUED'
    AND ("scheduledAt" IS NULL OR "scheduledAt" <= NOW())
  ORDER BY priority DESC, "createdAt" ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING *;
```

### How It Works:
1. **`FOR UPDATE`**: Locks the selected row for modification within the current transaction.
2. **`SKIP LOCKED`**: Instructs PostgreSQL to skip any rows currently locked by another worker transaction. Concurrent Worker B immediately evaluates the next available job without blocking or waiting.
3. **Atomic `UPDATE ... RETURNING`**: Wraps selection and state transition into a single atomic atomic database query, ensuring 100% thread safety across distributed worker nodes.
