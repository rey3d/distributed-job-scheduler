import {
  prisma,
  Job,
  JobStatus,
  ExecutionStatus,
  startExecution,
  recordHeartbeat,
  transitionJobState,
  handleJobFailure,
} from '@job-scheduler/shared';
import { JobHandlerRegistry, defaultRegistry } from './handlers/registry';

export async function processClaimedJob(
  job: Job,
  workerId: string,
  registry: JobHandlerRegistry = defaultRegistry
): Promise<boolean> {
  const attempt = job.attemptCount;
  const startedAt = Date.now();

  console.log(`▶️ [Worker ${workerId}] Executing job '${job.id}' (type: ${job.type}, attempt: ${attempt})`);

  let executionId: string | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  try {
    // 1. Record JobExecution start in Database (transitions state CLAIMED -> RUNNING)
    const execution = await startExecution(job.id, workerId);
    executionId = execution.id;

    // 2. Start Periodic Heartbeat Loop (every 5 seconds)
    heartbeatTimer = setInterval(async () => {
      try {
        await recordHeartbeat(job.id, workerId, { memoryUsage: process.memoryUsage().heapUsed });
      } catch (hbErr: any) {
        console.warn(`⚠️ [Worker ${workerId}] Heartbeat ping failed for job '${job.id}': ${hbErr.message}`);
      }
    }, 5000);

    // 3. Execute Job Handler
    const handlerResult = await registry.execute(job);
    const durationMs = Date.now() - startedAt;

    // Stop Heartbeat Timer
    if (heartbeatTimer) clearInterval(heartbeatTimer);

    // 4. Mark JobExecution SUCCESS in Database
    await prisma.jobExecution.update({
      where: { id: executionId },
      data: {
        status: ExecutionStatus.SUCCESS,
        finishedAt: new Date(),
        durationMs,
        result: typeof handlerResult === 'object' && handlerResult !== null ? handlerResult : { output: handlerResult },
      },
    });

    // 5. Transition Job State to COMPLETED
    await transitionJobState(job.id, JobStatus.COMPLETED, workerId, {
      message: `Job handler executed successfully in ${durationMs}ms`,
      meta: { result: handlerResult, durationMs },
    });

    console.log(`✅ [Worker ${workerId}] Job '${job.id}' completed in ${durationMs}ms`);
    return true;
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;

    // Stop Heartbeat Timer
    if (heartbeatTimer) clearInterval(heartbeatTimer);

    console.error(`❌ [Worker ${workerId}] Job '${job.id}' failed (attempt ${attempt}): ${err.message}`, err.stack);

    const errorPayload = {
      name: err.name || 'Error',
      message: err.message || 'Job execution thrown an exception',
      stack: err.stack,
      durationMs,
    };

    if (executionId) {
      // Delegate Failure, Retry Calculation, and DLQ Handoff to Core Job Engine
      await handleJobFailure(job.id, executionId, errorPayload);
    } else {
      // If startExecution failed before executionId was created, mark job FAILED
      await transitionJobState(job.id, JobStatus.FAILED, workerId, {
        message: `Execution start failed: ${err.message}`,
      });
    }

    return false;
  }
}
