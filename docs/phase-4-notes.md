# Phase 4 — Distributed Worker Service Architecture Notes

This document details the architecture, concurrency controls, shutdown procedures, and polling trade-offs implemented in `apps/worker`.

---

## 1. Concurrency-Limit Enforcement Approach

Concurrency control in a distributed environment operates at two distinct layers: **Queue Level** (global across all worker instances) and **Worker Process Level** (local to a single node).

```
                      ┌─────────────────────────────────┐
                      │    PostgreSQL Database (Prisma)  │
                      └────────────────┬────────────────┘
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            │                          │                          │
            ▼                          ▼                          ▼
   ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
   │ Worker Instance 1│        │ Worker Instance 2│        │ Worker Instance 3│
   │  Concurrency: 5 │        │  Concurrency: 5 │        │  Concurrency: 5 │
   └─────────────────┘        └─────────────────┘        └─────────────────┘
```

### A. Queue-Level Global Concurrency Limit
- Each `Queue` row has a `concurrencyLimit: Int` (e.g., max 10 parallel jobs).
- Before claiming a job, the worker queries:
  ```typescript
  const runningInQueue = await prisma.job.count({
    where: { queueId, status: 'RUNNING' }
  });
  if (runningInQueue >= queue.concurrencyLimit) continue; // Skip queue in current tick
  ```

### B. Worker Process-Level Concurrency Limit
- Each worker instance tracks `activeJobsCount` in memory, capped by `WORKER_CONCURRENCY` (default `5`).
- If `activeJobsCount >= maxWorkerConcurrency`, the polling cycle suspends claiming until an active job finishes.

### C. Atomic Job Claiming via DB Locking
- Race conditions between concurrent workers claiming jobs simultaneously are prevented at the database level using `SELECT FOR UPDATE SKIP LOCKED` inside raw PostgreSQL query (`claimNextJob`):
  ```sql
  UPDATE jobs
  SET status = 'CLAIMED', "claimedAt" = NOW(), "lockedByWorkerId" = $1, "lockExpiresAt" = NOW() + INTERVAL '30 seconds'
  WHERE id = (
    SELECT id FROM jobs
    WHERE "queueId" = $2 AND status = 'QUEUED' AND ("scheduledAt" IS NULL OR "scheduledAt" <= NOW())
    ORDER BY priority DESC, "createdAt" ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *;
  ```
- Guaranteed **zero duplicate job claims**, even under heavy multi-process contention.

---

## 2. Graceful Shutdown Behavior

When a worker instance receives `SIGINT` (Ctrl+C) or `SIGTERM` (container shutdown signal), it executes a non-destructive draining workflow:

```
[Signal SIGINT/SIGTERM] ──> Set isDraining = true ──> Stop Poller ──> Mark Worker DRAINING
                                                                            │
   ┌────────────────────────────────────────────────────────────────────────┘
   ▼
[In-Flight Jobs Count > 0?] ── Yes ──> Wait & Drain (up to SHUTDOWN_TIMEOUT_MS)
   │
  No
   ▼
[Mark Worker OFFLINE] ──> Disconnect Prisma ──> Exit Process (code 0)
```

### Shutdown Steps:
1. **Stop Claiming**: Poller sets `isDraining = true`, stopping any new `claimNextJob` invocations.
2. **Update Status**: Worker row in DB updates status to `DRAINING`.
3. **Drain Active Jobs**: Process waits for running jobs to finish, polling active count every 500ms up to `SHUTDOWN_TIMEOUT_MS` (default `10,000ms`).
4. **Timeout Safety Handoff**: If the timeout expires while a job is still stuck in execution, the worker process exits. The active job's lock (`lockExpiresAt`) will naturally expire within 30 seconds, allowing `reapStaleJobs()` to safely re-queue the job for another online worker to process.
5. **Clean Exit**: Worker row status updates to `OFFLINE`, Prisma client disconnects, and process exits with exit code `0`.

---

## 3. Polling Interval Trade-Offs (Database Load vs Job Latency)

The polling interval (`POLL_INTERVAL_MS`, default `500ms`) controls how frequently each worker process queries PostgreSQL for pending queued jobs.

| Strategy | Poll Interval | DB Query Frequency (3 Workers) | Pick-up Latency | Best Suited For |
| :--- | :--- | :--- | :--- | :--- |
| **Aggressive / Low Latency** | `100ms – 200ms` | ~15 – 30 queries / sec | ~100ms | High-throughput, time-sensitive jobs (e.g. transactional SMS/webhooks) |
| **Standard (Default)** | `500ms` | ~6 queries / sec | ~500ms | Balanced general-purpose operational background tasks |
| **Relaxed / Low DB Load** | `2000ms – 5000ms` | ~0.6 – 1.5 queries / sec | ~2s – 5s | Resource-constrained DBs, heavy long-running batch/analytical jobs |

### Adaptive Polling Recommendation:
In production scale, worker pollers can employ an **exponential backoff on empty queues**: when a queue returns no claimed jobs, increase polling interval dynamically from `200ms` up to `2000ms`, resetting back to `200ms` immediately when a job is claimed.
