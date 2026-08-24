import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Queue API Contract & Project Isolation Integration Tests', () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let projectId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
      })
    );
    await app.init();

    // 1. Register tenant
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `contract.user.${Date.now()}@acme.com`,
        password: 'password123',
        organizationName: 'Queue Contract Enterprise',
      });

    token = regRes.body.accessToken;
    orgId = regRes.body.organization.id;

    // 2. Create Project
    const projRes = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Queue Contract Project',
      });

    projectId = projRes.body.id;

    // 3. Create Queue under project
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/queues`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'contract-test-queue',
        priority: 15,
        concurrencyLimit: 20,
      });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /projects/:id/queues returns a paginated envelope containing a data array of queues', async () => {
    const res = await request(app.getHttpServer())
      .get(`/projects/${projectId}/queues`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const queue = res.body.data[0];
    expect(queue.name).toBe('contract-test-queue');
    expect(queue.projectId).toBe(projectId);
    expect(queue.priority).toBe(15);
    expect(queue.concurrencyLimit).toBe(20);
  });

  it('GET /projects/:id/queues requires valid JWT authorization header (401 response)', async () => {
    const res = await request(app.getHttpServer()).get(`/projects/${projectId}/queues`);
    expect(res.status).toBe(401);
  });
});
