import { Injectable, ForbiddenException } from '@nestjs/common';
import { prisma, JobStatus, DLQStatus } from '@job-scheduler/shared';
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

    if (queueIds.length === 0) {
      return {
        activeQueues: 0,
        pendingJobs: 0,
        completedToday: 0,
        deadLetterCount: 0,
      };
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [pendingJobsCount, completedTodayCount, deadLetterCount] = await Promise.all([
      // Pending backlog (QUEUED or SCHEDULED)
      prisma.job.count({
        where: {
          queueId: { in: queueIds },
          status: { in: [JobStatus.QUEUED, JobStatus.SCHEDULED] },
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
      // Unresolved Dead Letter Queue entries
      prisma.deadLetterJob.count({
        where: {
          queueId: { in: queueIds },
          status: DLQStatus.UNRESOLVED,
        },
      }),
    ]);

    return {
      activeQueues: activeQueuesCount,
      pendingJobs: pendingJobsCount,
      completedToday: completedTodayCount,
      deadLetterCount: deadLetterCount,
    };
  }
}
