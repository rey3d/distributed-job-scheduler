# 90-second reviewer demo script

Use this script when recording a short screen capture for the repository's
About section, README, or submission form. Keep the recording under 90 seconds.

1. Start the stack with `pnpm dev`. Show the five processes: API, web, and
   three workers.
2. Open **Worker Fleet**. Show the three online cards, each with a unique PID
   and a current heartbeat.
3. Open **Queues & Concurrency**. Show priority, queue-level concurrency,
   retry configuration, and pause/edit controls.
4. Enqueue a job from the dashboard, then show its completed execution in
   **Job Explorer**.
5. Show a failed job in **Dead Letter Queue**, including the failure reason and
   the **Retry Job** action.
6. Finish in a terminal with:

   ```bash
   pnpm --filter @job-scheduler/worker test:multi
   ```

   Highlight `50 / 50`, `Duplicate Executions: 0`, and `Launched Worker
   Instances: 3 of 3 processed jobs`.

Suggested title: **Distributed Job Scheduler — Multi-worker Reliability Demo**.
