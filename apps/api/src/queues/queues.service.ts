import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { prisma, JobStatus } from '@job-scheduler/shared';
import { CreateQueueDto } from './dto/create-queue.dto';
import { UpdateQueueDto } from './dto/update-queue.dto';
import { PaginationQueryDto, createPaginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class QueuesService {
  private async verifyProjectAccess(projectId: string, userOrgId: string) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: userOrgId },
    });
    if (!project) {
      throw new ForbiddenException(`Access denied to project '${projectId}'`);
    }
    return project;
  }

  private async verifyQueueAccess(queueId: string, userOrgId: string) {
    const queue = await prisma.queue.findFirst({
      where: {
        id: queueId,
        project: { organizationId: userOrgId },
      },
      include: {
        project: true,
        retryPolicy: true,
      },
    });
    if (!queue) {
      throw new NotFoundException(`Queue '${queueId}' not found or access denied`);
    }
    return queue;
  }

  async create(projectId: string, userOrgId: string, dto: CreateQueueDto) {
    await this.verifyProjectAccess(projectId, userOrgId);

    let retryPolicyId = dto.retryPolicyId;

    if (!retryPolicyId && dto.retryPolicy) {
      const policy = await prisma.retryPolicy.create({
        data: {
          name: dto.retryPolicy.name || `${dto.name}-policy`,
          strategy: dto.retryPolicy.strategy,
          baseDelaySec: dto.retryPolicy.baseDelaySec ?? 5,
          maxAttempts: dto.retryPolicy.maxAttempts ?? 3,
          maxDelayCapSec: dto.retryPolicy.maxDelayCapSec ?? 3600,
        },
      });
      retryPolicyId = policy.id;
    }

    return prisma.queue.create({
      data: {
        projectId,
        name: dto.name,
        description: dto.description,
        priority: dto.priority ?? 0,
        concurrencyLimit: dto.concurrencyLimit ?? 5,
        retryPolicyId: retryPolicyId || null,
      },
      include: {
        retryPolicy: true,
      },
    });
  }

  async findById(queueId: string, userOrgId: string) {
    return this.verifyQueueAccess(queueId, userOrgId);
  }

  async update(queueId: string, userOrgId: string, dto: UpdateQueueDto) {
    await this.verifyQueueAccess(queueId, userOrgId);

    return prisma.queue.update({
      where: { id: queueId },
      data: {
        description: dto.description,
        priority: dto.priority,
        concurrencyLimit: dto.concurrencyLimit,
        retryPolicyId: dto.retryPolicyId,
        updatedAt: new Date(),
      },
      include: {
        retryPolicy: true,
      },
    });
  }

  async delete(queueId: string, userOrgId: string) {
    await this.verifyQueueAccess(queueId, userOrgId);
    return prisma.queue.delete({
      where: { id: queueId },
    });
  }

  async setPaused(queueId: string, userOrgId: string, paused: boolean) {
    await this.verifyQueueAccess(queueId, userOrgId);
    return prisma.queue.update({
      where: { id: queueId },
      data: {
        paused,
        updatedAt: new Date(),
      },
    });
  }

  async findManyByProject(projectId: string, userOrgId: string, query: PaginationQueryDto) {
    await this.verifyProjectAccess(projectId, userOrgId);

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const [queues, total] = await Promise.all([
      prisma.queue.findMany({
        where: { projectId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          retryPolicy: true,
        },
      }),
      prisma.queue.count({ where: { projectId } }),
    ]);

    if (queues.length === 0) {
      return createPaginatedResponse([], total, page, limit);
    }

    const queueIds = queues.map((q) => q.id);

    // Efficient aggregate query for live counts (queued, running, failed)
    const jobCounts = await prisma.job.groupBy({
      by: ['queueId', 'status'],
      where: {
        queueId: { in: queueIds },
      },
      _count: {
        _all: true,
      },
    });

    const countMap: Record<string, { queued: number; running: number; failed: number }> = {};

    for (const item of jobCounts) {
      if (!countMap[item.queueId]) {
        countMap[item.queueId] = { queued: 0, running: 0, failed: 0 };
      }
      const count = item._count._all;
      if (item.status === JobStatus.QUEUED || item.status === JobStatus.SCHEDULED) {
        countMap[item.queueId].queued += count;
      } else if (item.status === JobStatus.CLAIMED || item.status === JobStatus.RUNNING) {
        countMap[item.queueId].running += count;
      } else if (item.status === JobStatus.FAILED) {
        countMap[item.queueId].failed += count;
      }
    }

    const queuesWithCounts = queues.map((q) => ({
      ...q,
      liveCounts: countMap[q.id] || { queued: 0, running: 0, failed: 0 },
    }));

    return createPaginatedResponse(queuesWithCounts, total, page, limit);
  }
}
