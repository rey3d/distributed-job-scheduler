import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { CreateScheduledJobDto } from './dto/create-scheduled-job.dto';
import { CreateBatchJobDto } from './dto/create-batch-job.dto';
import { JobFilterQueryDto } from './dto/job-filter.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Jobs')
@ApiBearerAuth()
@Controller()
export class JobsController {
  constructor(private jobsService: JobsService) {}

  @Post('queues/:id/jobs')
  @ApiOperation({ summary: 'Enqueue an immediate job into a queue' })
  @ApiResponse({ status: 201, description: 'Job enqueued' })
  async createJob(
    @Param('id') queueId: string,
    @CurrentUser('organizationId') userOrgId: string,
    @Body() dto: CreateJobDto
  ) {
    return this.jobsService.createJob(queueId, userOrgId, dto);
  }

  @Post('queues/:id/jobs/batch')
  @ApiOperation({ summary: 'Create a batch of linked jobs in a single request' })
  @ApiResponse({ status: 201, description: 'Batch created and jobs enqueued' })
  @ApiResponse({ status: 400, description: 'Empty batch array or batch size exceeds maximum 500 limit' })
  async createBatchJob(
    @Param('id') queueId: string,
    @CurrentUser('organizationId') userOrgId: string,
    @Body() dto: CreateBatchJobDto
  ) {
    return this.jobsService.createBatchJob(queueId, userOrgId, dto);
  }

  @Get('batches/:id')
  @ApiOperation({ summary: 'Get overall batch progress and status count breakdown' })
  @ApiResponse({ status: 200, description: 'Batch progress details' })
  @ApiResponse({ status: 404, description: 'Batch not found or access denied' })
  async getBatchProgress(
    @Param('id') batchId: string,
    @CurrentUser('organizationId') userOrgId: string
  ) {
    return this.jobsService.getBatchProgress(batchId, userOrgId);
  }

  @Post('queues/:id/jobs/scheduled')
  @ApiOperation({ summary: 'Enqueue a delayed or recurring cron job' })
  @ApiResponse({ status: 201, description: 'Scheduled or recurring job created' })
  @ApiResponse({ status: 400, description: 'Invalid cron expression or runAt timestamp' })
  async createScheduledJob(
    @Param('id') queueId: string,
    @CurrentUser('organizationId') userOrgId: string,
    @Body() dto: CreateScheduledJobDto
  ) {
    return this.jobsService.createScheduledJob(queueId, userOrgId, dto);
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Get full job details including executions and audit logs' })
  @ApiResponse({ status: 200, description: 'Job full details' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async findOne(
    @Param('id') jobId: string,
    @CurrentUser('organizationId') userOrgId: string
  ) {
    return this.jobsService.findById(jobId, userOrgId);
  }

  @Get('queues/:id/jobs')
  @ApiOperation({ summary: 'List jobs in a queue (paginated, filterable, sortable)' })
  @ApiResponse({ status: 200, description: 'Paginated job list' })
  async findMany(
    @Param('id') queueId: string,
    @CurrentUser('organizationId') userOrgId: string,
    @Query() query: JobFilterQueryDto
  ) {
    return this.jobsService.findManyByQueue(queueId, userOrgId, query);
  }

  @Post('jobs/:id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually re-queue an exhausted job from the Dead Letter Queue' })
  @ApiResponse({ status: 200, description: 'Job re-queued successfully' })
  @ApiResponse({ status: 404, description: 'Dead letter entry not found' })
  async retryDeadLetterJob(
    @Param('id') jobId: string,
    @CurrentUser('organizationId') userOrgId: string
  ) {
    return this.jobsService.retryDeadLetterJob(jobId, userOrgId);
  }

  @Delete('jobs/:id')
  @ApiOperation({ summary: 'Cancel a pending or scheduled job' })
  @ApiResponse({ status: 200, description: 'Job cancelled' })
  @ApiResponse({ status: 400, description: 'Cannot cancel active or completed job' })
  async cancelJob(
    @Param('id') jobId: string,
    @CurrentUser('organizationId') userOrgId: string
  ) {
    return this.jobsService.cancelJob(jobId, userOrgId);
  }
}
