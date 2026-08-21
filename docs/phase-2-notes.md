# Phase 2 — Core Job Lifecycle Engine Notes & Architecture

This document details the implementation of the core job lifecycle engine built in `packages/shared/src/job-engine/`.

---

## 1. Atomic Job Claiming Enforcement at the Database Level

### Locking Strategy: `SELECT ... FOR UPDATE SKIP LOCKED`

To guarantee that multiple worker processes polling the same queue never claim the same job twice or block each other, atomic job claiming is executed at the database layer via PostgreSQL's native `FOR UPDATE SKIP LOCKED` construct.

#### SQL Implementation (`packages/shared/src/job-engine/atomic-claim.ts`):
```sql
UPDATE jobs
SET 
  status = 'CLAIMED'::"JobStatus",
  "claimedAt" = NOW(),
  "lockedByWorkerId" = $1::uuid,
  "lockExpiresAt" = NOW() + INTERVAL '30 seconds',
  "updatedAt" = NOW()
WHERE id = (
  SELECT id
  FROM jobs
  WHERE "queueId" = $2::uuid
    AND status = 'QUEUED'::"JobStatus"
    AND ("scheduledAt" IS NULL OR "scheduledAt" <= NOW())
  ORDER BY priority DESC, "createdAt" ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING *;
```

### Why Application-Level Locking is Avoided:
- **No Redis / External Locks Needed**: Relying on application-level locks (e.g. Redlock or mutexes) introduces network overhead and single-point-of-failure risks.
- **Zero Lock Contention**: `SKIP LOCKED` causes PostgreSQL to instantly bypass any rows currently locked by another active transaction. 20 concurrent workers polling simultaneously evaluate distinct rows in parallel without waiting or deadlocking.
- **Transaction Safety**: The inner subquery lock is held only for the duration of the single `UPDATE` statement, completing in `< 1ms`.

---

## 2. Stale Job Reaping & Worker Failure Recovery

If a worker node crashes mid-execution (e.g. OOM, network disruption, server termination), jobs locked by that worker would remain stuck in `CLAIMED` or `RUNNING` forever without a recovery daemon.

### Reaping Mechanism (`reapStaleJobs()`):
1. **Heartbeats & Lock Extension**: Active workers emit periodic heartbeats (`recordHeartbeat()`) which extend `Job.lockExpiresAt` by `+30 seconds`.
2. **Reaper Sweep**: The background supervisor executes `reapStaleJobs()` periodically:
   - Queries `status IN ('CLAIMED', 'RUNNING') AND lockExpiresAt < NOW()`.
   - Re-queues expired jobs back to `QUEUED`.
   - Increments `attemptCount`.
   - Clears `lockedByWorkerId` and `lockExpiresAt`.
   - Emits a `WARN` audit log entry in `JobLog`.

---

## 3. Idempotency Guard Enforcement

### Strategy: Database-Level Unique Constraint (`idempotencyKey String? @unique`)

To prevent duplicate job execution side effects when clients or webhooks re-submit identical requests (e.g. retried HTTP calls):

1. **Schema Constraint**: The `Job` model includes a unique field `idempotencyKey String? @unique`.
2. **Creation Flow (`enqueueJobWithIdempotency()`)**:
   - Performs a fast preliminary index lookup for existing jobs with matching `idempotencyKey`.
   - If an existing job is found, returns `{ job: existingJob, duplicate: true }`.
   - If two concurrent requests attempt to insert the same `idempotencyKey` simultaneously, PostgreSQL rejects the second insertion with a unique constraint violation (`P2002`). The engine catches `P2002` gracefully and returns the existing job record.

---

## 4. Trade-Offs & Configuration Design Choices

| Parameter | Selected Value | Justification & Trade-offs |
| :--- | :--- | :--- |
| **Worker Lock Duration** | `30 seconds` | Balances fast failure detection against worker heartbeat frequency. Short locks (<10s) risk false positive reaps under CPU spikes; long locks (>60s) delay crash recovery. |
| **Worker Heartbeat Interval** | `10 seconds` | Ensures active workers send 3 pings per lock period, providing a 20-second safety margin before a job is considered stale. |
| **Polling Strategy** | `Atomic SKIP LOCKED` | Eliminates external lock coordination overhead. Under completely empty queues, workers sleep for a short interval (e.g. 500ms - 1s) to avoid database CPU spinning. |
| **Log Storage** | `JobLog` Table | Transition audit trails are written transactionally with state changes. High-volume stdout logs can be flushed asynchronously in batches. |
