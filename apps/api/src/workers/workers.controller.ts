import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { WorkersService } from './workers.service';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Workers & Monitoring')
@ApiBearerAuth()
@Controller('projects/:id')
export class WorkersController {
  constructor(private workersService: WorkersService) {}

  @Get('workers')
  @ApiOperation({ summary: 'Get worker fleet status and active assignments for a project' })
  @ApiResponse({ status: 200, description: 'Worker fleet details' })
  async getWorkers(
    @Param('id') projectId: string,
    @CurrentUser('organizationId') userOrgId: string
  ) {
    return this.workersService.getWorkersByProject(projectId, userOrgId);
  }

  @Get('dead-letter')
  @ApiOperation({ summary: 'Get paginated Dead Letter Queue entries for a project' })
  @ApiResponse({ status: 200, description: 'Paginated DLQ entries' })
  async getDeadLetterJobs(
    @Param('id') projectId: string,
    @CurrentUser('organizationId') userOrgId: string,
    @Query() query: PaginationQueryDto
  ) {
    return this.workersService.getDeadLetterJobs(projectId, userOrgId, query);
  }

  @Get('dashboard-summary')
  @ApiOperation({ summary: 'Get aggregate KPI metrics for dashboard cards' })
  @ApiResponse({ status: 200, description: 'Real aggregated dashboard KPI metrics' })
  async getDashboardSummary(
    @Param('id') projectId: string,
    @CurrentUser('organizationId') userOrgId: string
  ) {
    return this.workersService.getDashboardSummary(projectId, userOrgId);
  }
}
