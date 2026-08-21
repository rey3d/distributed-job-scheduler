import { Controller, Post, Get, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller()
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Post('organizations/:id/projects')
  @ApiOperation({ summary: 'Create a new project under an organization' })
  @ApiResponse({ status: 201, description: 'Project created' })
  @ApiResponse({ status: 403, description: 'Cross-tenant access forbidden' })
  async create(
    @Param('id') orgId: string,
    @CurrentUser('organizationId') userOrgId: string,
    @Body() dto: CreateProjectDto
  ) {
    return this.projectsService.create(orgId, userOrgId, dto);
  }

  @Get('projects/:id')
  @ApiOperation({ summary: 'Get project details by ID' })
  @ApiResponse({ status: 200, description: 'Project details' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async findOne(
    @Param('id') projectId: string,
    @CurrentUser('organizationId') userOrgId: string
  ) {
    return this.projectsService.findById(projectId, userOrgId);
  }

  @Get('organizations/:id/projects')
  @ApiOperation({ summary: 'List projects belonging to an organization (paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated project list' })
  async findMany(
    @Param('id') orgId: string,
    @CurrentUser('organizationId') userOrgId: string,
    @Query() query: PaginationQueryDto
  ) {
    return this.projectsService.findManyByOrg(orgId, userOrgId, query);
  }
}
