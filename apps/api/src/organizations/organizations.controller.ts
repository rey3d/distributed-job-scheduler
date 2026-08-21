import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { CurrentUser, UserPayload } from '../common/decorators/current-user.decorator';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private organizationsService: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new top-level tenant organization' })
  @ApiResponse({ status: 201, description: 'Organization created' })
  async create(@Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details for a specific organization' })
  @ApiResponse({ status: 200, description: 'Organization details' })
  @ApiResponse({ status: 403, description: 'Cross-tenant access forbidden' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser('organizationId') userOrgId: string
  ) {
    return this.organizationsService.findById(id, userOrgId);
  }
}
