import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { prisma } from '@job-scheduler/shared';
import { CreateProjectDto } from './dto/create-project.dto';
import { PaginationQueryDto, createPaginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class ProjectsService {
  async create(orgId: string, userOrgId: string, dto: CreateProjectDto) {
    if (orgId !== userOrgId) {
      throw new ForbiddenException('Access denied to cross-tenant organization');
    }

    const slug =
      dto.slug ||
      dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString().slice(-4);

    return prisma.project.create({
      data: {
        organizationId: orgId,
        name: dto.name,
        slug,
      },
    });
  }

  async findById(projectId: string, userOrgId: string) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: userOrgId, // Tenant Scoped Query
      },
      include: {
        _count: {
          select: { queues: true },
        },
      },
    });

    if (!project) {
      throw new NotFoundException(`Project '${projectId}' not found or access denied`);
    }

    return project;
  }

  async findManyByOrg(orgId: string, userOrgId: string, query: PaginationQueryDto) {
    if (orgId !== userOrgId) {
      throw new ForbiddenException('Access denied to cross-tenant organization');
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where: { organizationId: orgId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { queues: true },
          },
        },
      }),
      prisma.project.count({
        where: { organizationId: orgId },
      }),
    ]);

    return createPaginatedResponse(projects, total, page, limit);
  }
}
