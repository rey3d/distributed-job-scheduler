# Technical Design Decisions & Architecture Trade-Offs

This document synthesizes the core technical design choices, concurrency guarantees, performance trade-offs, scope boundaries, and honest scaling limitations of the **Distributed Job Scheduling Platform**.

---

## 1. Schema Shape & Multi-Tenancy (Phase 1)

### Multi-Tenant Isolation Boundary
- **Hierarchy**: `Organization -> Project -> Queue -> Job -> JobExecution`.
- **Tenant Scope Enforcement**: Every API controller endpoint (`apps/api`) verifies tenant membership via `CurrentUser('organizationId')`. Data is partitioned logically by `organizationId` rather than physically by database schema, striking an optimal balance between operational simplicity and strict multi-tenant isolation.

### Idempotency & Deduplication
- **Unique Constraint**: The `idempotencyKey` field on the `jobs` table uses a native PostgreSQL `UNIQUE` index.
- **Race Condition Safety**: Dual protection is provided: fast pre-lookup before insertion, and handling of database unique constraint errors (`P2002`) during concurrent insertions.

---

## 2. Atomic Job Claiming & Zero Double-Execution (Phase 2 & Phase 4)

### Concurrency Mechanism: PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED`
- **Why Native PostgreSQL Locking**:
  - Eliminates the need for external state stores like Redis or RabbitMQ for lock tracking.
  - Guarantees strict ACID consistency across transaction boundaries.
  - `SKIP LOCKED` allows concurrent worker processes to scan the queue simultaneously: when Worker A locks Job 1, Worker B automatically skips Job 1 and locks Job 2 with 0 latency or blocking.
- **Concurrency Test Verification**:
  - Verified across 20 concurrent database calls and **3 independent OS worker daemon processes**: 50/50 jobs were claimed and executed **exactly once** with **0 duplicate executions**.

---

## 3. Polling vs Push-Based Dispatch & Interval Tuning

| Aspect | Polling Architecture (Chosen) | Push-Based WebSockets / Server-Sent Events |
| :--- | :--- | :--- |
| **Worker Scaling** | Workers poll independently; simple horizontal scale-out | Requires persistent connection management & connection state |
| **Failover Safety** | Dead workers simply stop polling; active locks expire | Severed connections require complex re-subscription & state sync |
| **Configured Intervals** | **Worker Poller**: 200ms default interval (configurable per queue)<br>**Web Dashboard**: 5-second background polling loop | Real-time push updates over WebSocket |
| **Heartbeat Timeout** | 30-second lock expiration (`lockExpiresAt = NOW() + 30s`) | Real-time ping/pong framing |

---

## 4. Retry Policies, Crash Recovery, and Dead Letter Queue

### Retry Backoff Math
1. **FIXED**: Delay stays constant: `delay = baseDelaySec`.
2. **LINEAR**: Delay scales linearly with attempt count: `delay = attemptCount * baseDelaySec`.
3. **EXPONENTIAL**: Exponential backoff with optional max delay cap: `delay = min(baseDelaySec * 2^(attemptCount - 1), maxDelayCapSec)`.

### Crashed Worker Recovery (`reapStaleJobs()`)
- When a worker daemon crashes or loses network connectivity mid-execution, its active lock (`lockExpiresAt`) expires after 30 seconds.
- The background Reaper process scans for `status = 'CLAIMED'` jobs with `lockExpiresAt < NOW()`, clears the worker lock, increments `attemptCount`, and returns the job to `QUEUED` status for healthy workers.

### Dead Letter Queue (DLQ)
- When a job exceeds `maxAttempts`, it transitions to `FAILED` and an entry is created in `dead_letter_jobs` with status `UNRESOLVED`.
- Administrators can inspect errors via the Web Dashboard or API and issue a manual replay (`POST /jobs/:id/retry`), which re-queues the job with clean state.

---

## 5. Scope Boundaries & Bonus Features Assessment

| Feature | Status | Design Decision Rationale |
| :--- | :--- | :--- |
| **Queue Pause / Resume** | ✅ Implemented | Supported natively at queue level (`paused = true`). Atomic claiming queries join `queues` and filter `q.paused = false`. |
| **Idempotency Deduplication** | ✅ Implemented | Supported natively via `idempotencyKey` and PostgreSQL unique index. |
| **Cron / Delayed Jobs** | ✅ Implemented | Supported via `scheduledAt` and `cronExpression` parsing using `cron-parser`. |
| **Multi-Instance Concurrency** | ✅ Implemented | Verified across 3 concurrent worker processes with 0 duplicates. |
| **Workflow Dependency Graphs (DAGs)** | ⏸️ Scope Decision | Left out to focus on rock-solid single-job atomic scheduling, retries, and monitoring. Schema can be extended with a `parentJobId` or `JobDependency` table. |
| **Redis / Distributed Lock Service** | ⏸️ Scope Decision | Chose native PostgreSQL `FOR UPDATE SKIP LOCKED` to minimize infrastructure complexity while maintaining 100% ACID correctness. |

---

## 6. Honest Limitations & Scale-Out Path

1. **Database Bottleneck at Extreme Scale**:
   - A single PostgreSQL primary node handles job state transactions. While PostgreSQL can sustain thousands of job claims per second with indexed `SKIP LOCKED`, ultra-high throughput (100k+ ops/sec) would require queue sharding across multiple PostgreSQL databases or a Redis-backed buffer layer.
2. **Long-Running Job Lock Maintenance**:
   - Jobs executing longer than 30 seconds rely on active worker heartbeats (`upsertWorkerHeartbeat`) to extend `lockExpiresAt`. If a long-running CPU job starves the event loop, the reaper might prematurely re-queue it. (Mitigated by worker heartbeats running in async timer intervals).
