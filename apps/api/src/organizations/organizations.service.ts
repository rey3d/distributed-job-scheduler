import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { prisma } from '@job-scheduler/shared';
import { CreateOrganizationDto } from './dto/create-organization.dto';

@Injectable()
export class OrganizationsService {
  async create(dto: CreateOrganizationDto) {
    const slug =
      dto.slug ||
      dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString().slice(-4);

    return prisma.organization.create({
      data: {
        name: dto.name,
        slug,
      },
    });
  }

  async findById(orgId: string, currentOrgId: string) {
    // Tenant Isolation Check
    if (orgId !== currentOrgId) {
      throw new ForbiddenException('Access denied to cross-tenant organization');
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        _count: {
          select: { users: true, projects: true },
        },
      },
    });

    if (!org) {
      throw new NotFoundException(`Organization '${orgId}' not found`);
    }

    return org;
  }

  async findUsersByOrg(orgId: string, currentOrgId: string) {
    if (orgId !== currentOrgId) {
      throw new ForbiddenException('Access denied to cross-tenant organization');
    }

    return prisma.user.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
