import { prisma, WorkerStatus } from '@job-scheduler/shared';
import os from 'os';

export interface WorkerNodeIdentity {
  id: string;
  name: string;
  hostname: string;
  pid: number;
}

export async function registerWorkerNode(namePrefix = 'worker'): Promise<WorkerNodeIdentity> {
  const hostname = os.hostname();
  const pid = process.pid;
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const name = `${namePrefix}-${hostname}-${pid}-${randomSuffix}`;

  const worker = await prisma.worker.create({
    data: {
      name,
      hostname,
      processId: pid,
      status: WorkerStatus.ONLINE,
      lastSeenAt: new Date(),
    },
  });

  console.log(`⚡ [Worker Identity] Registered worker instance '${worker.name}' (ID: ${worker.id})`);

  return {
    id: worker.id,
    name: worker.name,
    hostname: worker.hostname,
    pid: worker.processId,
  };
}

export async function updateWorkerStatus(workerId: string, status: WorkerStatus) {
  try {
    await prisma.worker.update({
      where: { id: workerId },
      data: {
        status,
        lastSeenAt: new Date(),
      },
    });
  } catch (err: any) {
    console.warn(`⚠️ [Worker Identity] Failed to update status for worker '${workerId}': ${err.message}`);
  }
}

export async function touchWorkerHeartbeat(workerId: string) {
  try {
    await prisma.worker.update({
      where: { id: workerId },
      data: {
        lastSeenAt: new Date(),
      },
    });
  } catch (err: any) {
    console.warn(`⚠️ [Worker Identity] Heartbeat touch failed for worker '${workerId}': ${err.message}`);
  }
}

export async function deregisterWorkerNode(workerId: string) {
  try {
    await prisma.worker.update({
      where: { id: workerId },
      data: {
        status: WorkerStatus.OFFLINE,
        lastSeenAt: new Date(),
      },
    });
    console.log(`🛑 [Worker Identity] Worker instance '${workerId}' set to OFFLINE`);
  } catch (err: any) {
    console.warn(`⚠️ [Worker Identity] Failed to set worker '${workerId}' offline: ${err.message}`);
  }
}
