import { Controller, Get } from '@nestjs/common';
import { prisma } from '@job-scheduler/shared';

@Controller()
export class AppController {
  @Get('health')
  async getHealth() {
    let dbStatus = 'disconnected';
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch {
      dbStatus = 'error';
    }

    return {
      status: 'ok',
      service: 'distributed-job-scheduler-api',
      timestamp: new Date().toISOString(),
      database: dbStatus,
    };
  }
}
