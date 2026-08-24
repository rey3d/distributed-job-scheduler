# AetherFlow — Multi-Worker Deployment & Horizontal Scaling Guide

## 1. Overview

AetherFlow is engineered as a **massively multi-tenant, horizontally scalable distributed job engine**. Worker nodes operate as stateless, self-registering daemons that poll PostgreSQL concurrently to execute queued jobs.

---

## 2. Multi-Worker Architecture

```
                      +-------------------+
                      |   PostgreSQL 16   |
                      |  (Jobs Queue DB)  |
                      +---------+---------+
                                |
          +---------------------+---------------------+
          | (FOR UPDATE SKIP LOCKED)                  |
          v                                           v
+-------------------+                       +-------------------+
|  Worker Node 1    |                       |  Worker Node 2    |
| (Replica Container)|                      | (Replica Container)|
+-------------------+                       +-------------------+
          |                                           |
          +---------------------+---------------------+
                                |
                                v
                      +-------------------+
                      |  Worker Node 3    |
                      | (Replica Container)|
                      +-------------------+
```

### Key Principles

1. **Self-Registration**: Every worker process generates a unique UUID on boot, registers its hostname and process ID (PID) in PostgreSQL, and creates an entry in the `workers` table with `status = ONLINE`.
2. **Atomic Job Claiming (`FOR UPDATE SKIP LOCKED`)**:
   - Workers query PostgreSQL using raw SQL with row-level locks.
   - When Worker 1 claims Job X, PostgreSQL locks Job X's row for Worker 1's transaction.
   - Worker 2 and Worker 3 immediately skip Job X without waiting or blocking, preventing duplicate executions under high worker replica counts.
3. **Heartbeat Loop (5s)**:
   - Each worker sends a heartbeat record to PostgreSQL every 5 seconds updating its `lastSeenAt` timestamp and current active job execution count.
4. **Fault Tolerance & Stale Job Reaping**:
   - If Worker 2 crashes or suffers a hardware fault, surviving workers detect that Worker 2's heartbeat expired (> 30s lock timeout).
   - `reapStaleJobs()` automatically reclaims Worker 2's orphaned jobs, increments their `attemptCount`, and returns them to the `QUEUED` state or moves them to `dead_letter_jobs` if `maxAttempts` is reached.

---

## 3. Running Multi-Worker Deployment

### Docker Compose Replica Deployment (Recommended)

To launch the full stack with **3 worker replicas** automatically:

```bash
docker-compose up -d --build
```

To scale worker replicas dynamically on the command line:

```bash
docker-compose up -d --scale worker=5
```

### Local CLI Multi-Worker Execution

During local development, you can spin up multiple independent worker processes in separate terminal windows:

```bash
# Terminal 1 (Worker 1)
pnpm --filter @job-scheduler/worker start

# Terminal 2 (Worker 2)
pnpm --filter @job-scheduler/worker start

# Terminal 3 (Worker 3)
pnpm --filter @job-scheduler/worker start
```

Or run the automated multi-worker simulation script:

```bash
npx ts-node scripts/run-multi-worker-test.ts
```

---

## 4. Concurrency & Throughput Tuning

| Environment Variable | Default | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://...` | Connection string to PostgreSQL 16 |
| `POLL_INTERVAL_MS` | `1000` | Polling frequency (ms) when queue is idle |
| `HEARTBEAT_INTERVAL_MS` | `5000` | Liveness heartbeat interval (ms) |

### Scale-Out Guidelines

- **CPU-bound Workloads**: Set worker replicas equal to the total CPU cores across your container cluster.
- **I/O-bound Workloads (API/Email)**: Scale worker replicas to 10–20+ containers per database node.
- **Queue Concurrency Limits**: Each queue defines a `concurrencyLimit`. The engine enforces that the aggregate number of running jobs across all worker instances never exceeds this threshold.
