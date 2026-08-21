import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { QueuesService } from './queues.service';
import { CreateQueueDto } from './dto/create-queue.dto';
import { UpdateQueueDto } from './dto/update-queue.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Queues')
@ApiBearerAuth()
@Controller()
export class QueuesController {
  constructor(private queuesService: QueuesService) {}

  @Post('projects/:id/queues')
  @ApiOperation({ summary: 'Create a job queue under a project' })
  @ApiResponse({ status: 201, description: 'Queue created' })
  async create(
    @Param('id') projectId: string,
    @CurrentUser('organizationId') userOrgId: string,
    @Body() dto: CreateQueueDto
  ) {
    return this.queuesService.create(projectId, userOrgId, dto);
  }

  @Get('queues/:id')
  @ApiOperation({ summary: 'Get queue details by ID' })
  @ApiResponse({ status: 200, description: 'Queue details' })
  async findOne(
    @Param('id') queueId: string,
    @CurrentUser('organizationId') userOrgId: string
  ) {
    return this.queuesService.findById(queueId, userOrgId);
  }

  @Patch('queues/:id')
  @ApiOperation({ summary: 'Update queue configuration' })
  @ApiResponse({ status: 200, description: 'Queue configuration updated' })
  async update(
    @Param('id') queueId: string,
    @CurrentUser('organizationId') userOrgId: string,
    @Body() dto: UpdateQueueDto
  ) {
    return this.queuesService.update(queueId, userOrgId, dto);
  }

  @Delete('queues/:id')
  @ApiOperation({ summary: 'Delete a queue and its jobs' })
  @ApiResponse({ status: 200, description: 'Queue deleted' })
  async delete(
    @Param('id') queueId: string,
    @CurrentUser('organizationId') userOrgId: string
  ) {
    return this.queuesService.delete(queueId, userOrgId);
  }

  @Post('queues/:id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause job claiming on a queue' })
  @ApiResponse({ status: 200, description: 'Queue paused' })
  async pause(
    @Param('id') queueId: string,
    @CurrentUser('organizationId') userOrgId: string
  ) {
    return this.queuesService.setPaused(queueId, userOrgId, true);
  }

  @Post('queues/:id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume job claiming on a queue' })
  @ApiResponse({ status: 200, description: 'Queue resumed' })
  async resume(
    @Param('id') queueId: string,
    @CurrentUser('organizationId') userOrgId: string
  ) {
    return this.queuesService.setPaused(queueId, userOrgId, false);
  }

  @Get('projects/:id/queues')
  @ApiOperation({ summary: 'List queues under a project with live job counts (paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated queue list' })
  async findMany(
    @Param('id') projectId: string,
    @CurrentUser('organizationId') userOrgId: string,
    @Query() query: PaginationQueryDto
  ) {
    return this.queuesService.findManyByProject(projectId, userOrgId, query);
  }
}
