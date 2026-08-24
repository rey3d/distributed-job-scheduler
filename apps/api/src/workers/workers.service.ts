import { Injectable, ForbiddenException } from '@nestjs/common';
import { prisma, Prisma, JobStatus, DLQStatus } from '@job-scheduler/shared';
import { PaginationQueryDto, createPaginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class WorkersService {
  private async verifyProjectAccess(projectId: string, userOrgId: string) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: userOrgId },
    });
    if (!project) {
      throw new ForbiddenException(`Access denied to project '${projectId}'`);
    }
    return project;
  }

  async getWorkersByProject(projectId: string, userOrgId: string) {
    await this.verifyProjectAccess(projectId, userOrgId);

    // Registered active/online workers
    const workers = await prisma.worker.findMany({
      orderBy: { lastSeenAt: 'desc' },
      include: {
        heartbeats: {
          take: 1,
          orderBy: { timestamp: 'desc' },
          include: {
            currentJob: {
              select: {
                id: true,
                type: true,
                status: true,
                startedAt: true,
              },
            },
          },
        },
      },
    });

    return workers;
  }

  async getDeadLetterJobs(projectId: string, userOrgId: string, query: PaginationQueryDto) {
    await this.verifyProjectAccess(projectId, userOrgId);

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const queues = await prisma.queue.findMany({
      where: { projectId },
      select: { id: true },
    });

    const queueIds = queues.map((q) => q.id);

    if (queueIds.length === 0) {
      return createPaginatedResponse([], 0, page, limit);
    }

    const [dlqEntries, total] = await Promise.all([
      prisma.deadLetterJob.findMany({
        where: { queueId: { in: queueIds } },
        skip,
        take: limit,
        orderBy: { failedAt: 'desc' },
        include: {
          originalJob: {
            select: { id: true, type: true, createdAt: true },
          },
          queue: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.deadLetterJob.count({
        where: { queueId: { in: queueIds } },
      }),
    ]);

    return createPaginatedResponse(dlqEntries, total, page, limit);
  }

  async getDashboardSummary(projectId: string, userOrgId: string) {
    await this.verifyProjectAccess(projectId, userOrgId);

    const queues = await prisma.queue.findMany({
      where: { projectId },
      select: { id: true, paused: true },
    });

    const queueIds = queues.map((q) => q.id);
    const activeQueuesCount = queues.filter((q) => !q.paused).length;
    const pausedQueuesCount = queues.filter((q) => q.paused).length;

    const now = new Date();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);

    if (queueIds.length === 0) {
      return {
        activeQueues: 0,
        pausedQueues: 0,
        pendingJobs: 0,
        runningJobs: 0,
        completedToday: 0,
        failedToday: 0,
        deadLetterCount: 0,
        onlineWorkers: 0,
        successRate24h: 100.0,
        systemHealth: 'HEALTHY' as const,
      };
    }

    const [
      pendingJobsCount,
      runningJobsCount,
      completedTodayCount,
      failedTodayCount,
      deadLetterCount,
      onlineWorkersCount,
    ] = await Promise.all([
      // Pending backlog (QUEUED or SCHEDULED)
      prisma.job.count({
        where: {
          queueId: { in: queueIds },
          status: { in: [JobStatus.QUEUED, JobStatus.SCHEDULED] },
        },
      }),
      // Currently Running / Claimed
      prisma.job.count({
        where: {
          queueId: { in: queueIds },
          status: { in: [JobStatus.RUNNING, JobStatus.CLAIMED] },
        },
      }),
      // Completed since midnight
      prisma.job.count({
        where: {
          queueId: { in: queueIds },
          status: JobStatus.COMPLETED,
          finishedAt: { gte: startOfToday },
        },
      }),
      // Failed since midnight
      prisma.job.count({
        where: {
          queueId: { in: queueIds },
          status: JobStatus.FAILED,
          finishedAt: { gte: startOfToday },
        },
      }),
      // Unresolved Dead Letter Queue entries
      prisma.deadLetterJob.count({
        where: {
          queueId: { in: queueIds },
          status: DLQStatus.UNRESOLVED,
        },
      }),
      // Online active workers
      prisma.worker.count({
        where: {
          lastSeenAt: { gte: thirtySecondsAgo },
        },
      }),
    ]);

    const totalFinishedToday = completedTodayCount + failedTodayCount;
    const successRate24h =
      totalFinishedToday > 0
        ? Number(((completedTodayCount / totalFinishedToday) * 100).toFixed(1))
        : 100.0;

    let systemHealth: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
    if (deadLetterCount > 10 || successRate24h < 90) {
      systemHealth = 'CRITICAL';
    } else if (deadLetterCount > 0 || successRate24h < 98 || pausedQueuesCount > 0) {
      systemHealth = 'DEGRADED';
    }

    return {
      activeQueues: activeQueuesCount,
      pausedQueues: pausedQueuesCount,
      pendingJobs: pendingJobsCount,
      runningJobs: runningJobsCount,
      completedToday: completedTodayCount,
      failedToday: failedTodayCount,
      deadLetterCount: deadLetterCount,
      onlineWorkers: onlineWorkersCount,
      successRate24h,
      systemHealth,
    };
  }

  async getThroughputChart(projectId: string, userOrgId: string, hours = 6) {
    await this.verifyProjectAccess(projectId, userOrgId);

    const queues = await prisma.queue.findMany({
      where: { projectId },
      select: { id: true },
    });

    const queueIds = queues.map((q) => q.id);

    if (queueIds.length === 0) {
      return { hours, intervalMinutes: 15, buckets: [] };
    }

    const now = new Date();
    const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

    const completedBuckets = await prisma.$queryRaw<Array<{ time_bucket: Date; count: bigint }>>`
      SELECT 
        to_timestamp(floor(extract(epoch from j."finishedAt") / (15 * 60)) * (15 * 60)) AS time_bucket,
        COUNT(*)::bigint AS count
      FROM jobs j
      INNER JOIN queues q ON j."queueId" = q.id
      WHERE q."projectId" = ${projectId}::uuid
        AND j.status = 'COMPLETED'
        AND j."finishedAt" >= ${startTime}
      GROUP BY time_bucket
      ORDER BY time_bucket ASC;
    `;

    const buckets = completedBuckets.map((b) => ({
      time: b.time_bucket.toISOString(),
      label: new Date(b.time_bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      completedCount: Number(b.count),
    }));

    return {
      hours,
      intervalMinutes: 15,
      buckets,
    };
  }
}
