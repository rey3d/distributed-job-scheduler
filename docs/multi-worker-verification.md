# Multi-worker verification

This project includes a reproducible proof that the scheduler distributes work
across independent worker processes without duplicate job execution.

## Reviewer quick start

1. Configure the required environment values:

   ```bash
   cp .env.example .env
   ```

2. Start PostgreSQL (or use a reachable PostgreSQL instance in `DATABASE_URL`):

   ```bash
   docker compose up -d postgres
   ```

3. Generate the Prisma client and apply the schema, then run the proof:

   ```bash
   pnpm db:generate
   pnpm db:push
   pnpm --filter @job-scheduler/worker test:multi
   ```

The proof seeds 50 jobs, starts three independent OS worker processes, waits
for completion, gracefully stops them, and inspects the database records. It
passes only when all of these conditions hold:

- 50 of 50 jobs completed.
- Every job has exactly one execution record (zero duplicates).
- At least two of the three worker processes launched by the proof executed jobs.
- The command exits with status code 0.

Representative final output:

```text
Jobs Completed:             50 / 50
Duplicate Executions:       0 (Must be 0)
Launched Worker Instances:  3 of 3 processed jobs
[SUCCESS] 100% Exact Execution!
```

## Docker demonstration

To inspect three long-lived worker replicas in the dashboard, run:

```bash
docker compose up --build --scale worker=3
```

The worker service self-registers each replica in PostgreSQL. The Worker Fleet
screen displays their unique worker IDs, hostnames, status, heartbeat times,
and active work. The atomic claim query uses PostgreSQL row locks with `SKIP
LOCKED`; its queue-row lock also enforces the shared queue concurrency limit.
