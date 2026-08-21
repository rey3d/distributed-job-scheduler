# Phase 3 — REST API Architecture & Tenant Isolation Notes

This document details the REST API architecture implemented in `apps/api`.

---

## 1. Query-Level Tenant Isolation

Security boundaries in a multi-tenant business operations platform must be enforced at the **database query level** rather than relying solely on controller checks.

### Implementation Strategy:
1. **JWT Auth Payload**: Every authenticated request passes through `JwtAuthGuard` and extracts `{ userId, organizationId, email, role }` into `@CurrentUser()`.
2. **Query Scoping**:
   - Primary lookups strictly include `organizationId` in the `WHERE` clause:
     ```typescript
     // Project Service lookup
     const project = await prisma.project.findFirst({
       where: {
         id: projectId,
         organizationId: userOrgId, // Scoped to requesting tenant
       },
     });
     ```
   - Nested resources (Queues, Jobs, DLQ entries) join through their parent hierarchy:
     ```typescript
     // Queue Service lookup
     const queue = await prisma.queue.findFirst({
       where: {
         id: queueId,
         project: { organizationId: userOrgId },
       },
     });
     ```
3. **Cross-Tenant Request Rejection**: If User B (Org B) requests `/projects/proj-A-id` or `/queues/queue-A-id`, the query returns `null`, triggering a `404 Not Found` or `403 Forbidden` response. Zero cross-tenant data leakage occurs.

---

## 2. Standardized Pagination & Filtering Convention

All list endpoints enforce consistent query parameters and response envelopes across the API.

### Query Parameters:
- `page`: `number` (default `1`, minimum `1`)
- `limit`: `number` (default `20`, minimum `1`, maximum `100`)

### Standard Response Envelope (`PaginatedResponse<T>`):
```json
{
  "data": [ ... ],
  "meta": {
    "total": 142,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

---

## 3. OpenAPI / Swagger Documentation

Interactive OpenAPI / Swagger documentation is served at `/api/docs`:

- **URL**: `http://localhost:3001/api/docs`
- **Security**: Configured with `@ApiBearerAuth()` for JWT Bearer token authentication in Swagger UI.
- **Tags**: Categorized under `Authentication`, `Organizations`, `Projects`, `Queues`, `Jobs`, and `Workers & Monitoring`.
- **Validation**: All mutating request bodies are validated using `class-validator` and `class-transformer` pipes.
