import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  prisma,
  enqueueJobWithIdempotency,
  transitionJobState,
  JobStatus,
  DLQStatus,
} from '@job-scheduler/shared';
import cronParser from 'cron-parser';
import { CreateJobDto } from './dto/create-job.dto';
import { CreateScheduledJobDto } from './dto/create-scheduled-job.dto';
import { CreateBatchJobDto } from './dto/create-batch-job.dto';
import { JobFilterQueryDto } from './dto/job-filter.dto';
import { createPaginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class JobsService {
  private async verifyQueueAccess(queueId: string, userOrgId: string) {
    const queue = await prisma.queue.findFirst({
      where: {
        id: queueId,
        project: { organizationId: userOrgId },
      },
    });

    if (!queue) {
      throw new NotFoundException(`Queue '${queueId}' not found or access denied`);
    }

    return queue;
  }

  private async verifyJobAccess(jobId: string, userOrgId: string) {
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        queue: { project: { organizationId: userOrgId } },
      },
      include: {
        queue: {
          include: {
            retryPolicy: true,
          },
        },
        executions: {
          orderBy: { attempt: 'asc' },
        },
        logs: {
          orderBy: { timestamp: 'asc' },
        },
        deadLetterJob: true,
      },
    });

    if (!job) {
      throw new NotFoundException(`Job '${jobId}' not found or access denied`);
    }

    return job;
  }

  async createJob(queueId: string, userOrgId: string, dto: CreateJobDto) {
    await this.verifyQueueAccess(queueId, userOrgId);

    const scheduledAt =
      dto.delaySec && dto.delaySec > 0 ? new Date(Date.now() + dto.delaySec * 1000) : undefined;

    const result = await enqueueJobWithIdempotency(
      queueId,
      dto.type,
      dto.payload,
      dto.idempotencyKey,
      {
        priority: dto.priority ?? 0,
        maxAttempts: dto.maxAttempts ?? 3,
        scheduledAt,
      }
    );

    return result;
  }

  async createBatchJob(queueId: string, userOrgId: string, dto: CreateBatchJobDto) {
    await this.verifyQueueAccess(queueId, userOrgId);

    if (!dto.jobs || dto.jobs.length === 0) {
      throw new BadRequestException('Batch cannot be empty. Must include at least 1 job definition.');
    }

    if (dto.jobs.length > 500) {
      throw new BadRequestException('Batch size exceeds maximum limit of 500 jobs per call');
    }

    return await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.create({
        data: {
          queueId,
          totalJobs: dto.jobs.length,
        },
      });

      const createdJobs: any[] = [];
      for (const item of dto.jobs) {
        const enqueueRes = await enqueueJobWithIdempotency(
          queueId,
          item.type,
          item.payload,
          item.idempotencyKey,
          {
            priority: item.priority ?? 0,
            maxAttempts: item.maxAttempts ?? 3,
          },
          tx
        );

        const updatedJob = await tx.job.update({
          where: { id: enqueueRes.job.id },
          data: { batchId: batch.id },
        });

        createdJobs.push(updatedJob);
      }

      return {
        batchId: batch.id,
        queueId,
        totalJobs: batch.totalJobs,
        createdJobsCount: createdJobs.length,
        createdAt: batch.createdAt,
      };
    });
  }

  async getBatchProgress(batchId: string, userOrgId: string) {
    const batch = await prisma.batch.findFirst({
      where: {
        id: batchId,
        queue: {
          project: {
            organizationId: userOrgId,
          },
        },
      },
      include: {
        queue: {
          select: { id: true, name: true },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException(`Batch '${batchId}' not found or access denied`);
    }

    const statusCounts = await prisma.job.groupBy({
      by: ['status'],
      where: { batchId },
      _count: { _all: true },
    });

    const counts: Record<string, number> = {
      QUEUED: 0,
      SCHEDULED: 0,
      CLAIMED: 0,
      RUNNING: 0,
      COMPLETED: 0,
      FAILED: 0,
      CANCELLED: 0,
    };

    for (const item of statusCounts) {
      counts[item.status] = item._count._all;
    }

    return {
      id: batch.id,
      queueId: batch.queueId,
      queueName: batch.queue.name,
      totalJobs: batch.totalJobs,
      createdAt: batch.createdAt,
      counts,
    };
  }

  async createScheduledJob(queueId: string, userOrgId: string, dto: CreateScheduledJobDto) {
    await this.verifyQueueAccess(queueId, userOrgId);

    if (!dto.runAt && !dto.cronExpression) {
      throw new BadRequestException('Either runAt timestamp or cronExpression must be provided');
    }

    let nextRunAt: Date;

    if (dto.cronExpression) {
      // Validate Cron Expression Server-side
      try {
        const interval = cronParser.parseExpression(dto.cronExpression);
        nextRunAt = interval.next().toDate();
      } catch (err: any) {
        throw new BadRequestException(`Invalid cron expression '${dto.cronExpression}': ${err.message}`);
      }

      const scheduledJob = await prisma.scheduledJob.create({
        data: {
          queueId,
          name: dto.name,
          jobType: dto.jobType,
          payload: dto.payload,
          cronExpression: dto.cronExpression,
          nextRunAt,
          enabled: true,
        },
      });

      return {
        type: 'recurring',
        scheduledJob,
        nextRunAt,
      };
    } else {
      nextRunAt = new Date(dto.runAt!);
      if (isNaN(nextRunAt.getTime())) {
        throw new BadRequestException(`Invalid runAt timestamp '${dto.runAt}'`);
      }

      const isFuture = nextRunAt.getTime() > Date.now();

      const job = await prisma.job.create({
        data: {
          queueId,
          type: dto.jobType,
          payload: dto.payload,
          priority: 0,
          maxAttempts: 3,
          scheduledAt: nextRunAt,
          status: isFuture ? JobStatus.SCHEDULED : JobStatus.QUEUED,
        },
      });

      await prisma.jobLog.create({
        data: {
          jobId: job.id,
          level: 'INFO',
          message: `Scheduled job '${dto.jobType}' created for ${nextRunAt.toISOString()}`,
          timestamp: new Date(),
        },
      });

      return {
        type: 'one-time',
        job,
        nextRunAt,
      };
    }
  }

  async findById(jobId: string, userOrgId: string) {
    await this.verifyJobAccess(jobId, userOrgId);

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        queue: {
          include: {
            project: true,
          },
        },
        lockedByWorker: {
          select: {
            id: true,
            name: true,
            hostname: true,
            status: true,
          },
        },
        executions: {
          orderBy: { attempt: 'asc' },
          include: {
            worker: {
              select: { id: true, name: true, hostname: true },
            },
          },
        },
        logs: {
          orderBy: { timestamp: 'asc' },
        },
        deadLetterJob: true,
      },
    });

    return job;
  }

  async findManyByQueue(queueId: string, userOrgId: string, query: JobFilterQueryDto) {
    await this.verifyQueueAccess(queueId, userOrgId);

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = { queueId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          executions: {
            take: 1,
            orderBy: { attempt: 'desc' },
          },
        },
      }),
      prisma.job.count({ where }),
    ]);

    return createPaginatedResponse(jobs, total, page, limit);
  }

  async retryDeadLetterJob(jobId: string, userOrgId: string) {
    await this.verifyJobAccess(jobId, userOrgId);

    return await prisma.$transaction(async (tx) => {
      const dlqEntry = await tx.deadLetterJob.findUnique({
        where: { originalJobId: jobId },
      });

      if (!dlqEntry) {
        throw new NotFoundException(`Dead Letter Queue entry for job '${jobId}' not found`);
      }

      // Update DLQ status to RETRIED
      await tx.deadLetterJob.update({
        where: { id: dlqEntry.id },
        data: {
          status: DLQStatus.RETRIED,
          updatedAt: new Date(),
        },
      });

      // Reset Job status back to QUEUED and reset attempt count or grant additional attempts
      const updatedJob = await tx.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.QUEUED,
          attemptCount: 0,
          scheduledAt: null,
          claimedAt: null,
          startedAt: null,
          finishedAt: null,
          lockedByWorkerId: null,
          lockExpiresAt: null,
          updatedAt: new Date(),
        },
      });

      await tx.jobLog.create({
        data: {
          jobId,
          level: 'INFO',
          message: `Job manually retried and re-queued from Dead Letter Queue by user`,
          meta: {
            actor: 'user:manual_retry',
            previousStatus: JobStatus.FAILED,
            newStatus: JobStatus.QUEUED,
          },
          timestamp: new Date(),
        },
      });

      return updatedJob;
    });
  }

  async cancelJob(jobId: string, userOrgId: string) {
    const job = await this.verifyJobAccess(jobId, userOrgId);

    if (job.status === JobStatus.RUNNING || job.status === JobStatus.COMPLETED) {
      throw new BadRequestException(`Cannot cancel job in '${job.status}' status`);
    }

    const cancelledJob = await transitionJobState(
      jobId,
      JobStatus.CANCELLED,
      'user:manual_cancel',
      { message: `Job manually cancelled via API` }
    );

    return cancelledJob;
  }
}
