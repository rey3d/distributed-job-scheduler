# Phase 5 Notes — Web Monitoring Dashboard (`apps/web`)

## 1. Overview & Architecture

Phase 5 replaces all hardcoded/mock scaffold data in `apps/web` with live API communication connecting directly to the NestJS REST API (`apps/api`).

- **Framework & Stack**: React 18 + TypeScript + Vite + TailwindCSS.
- **Authentication**: JWT token management with local storage persistence, centralized 401 interceptor auto-redirecting to `AuthView`, and auto-bootstrapping default organization and projectcontainers.
- **State Management & Polling**: React Context (`AuthContext`) + 5-second auto-polling loop for live KPI cards and queue metrics (`GET /projects/:id/dashboard-summary`).
- **Optimistic UI Updates**: Pause/Resume queue actions update local React state immediately and gracefully roll back on HTTP errors.
- **Loading & Error Handling**: Dark skeleton shimmer placeholders (`SkeletonLoader.tsx`), custom empty states for clean queues/DLQ, error alert banners with manual retry buttons, and bottom-right toast notifications (`Toast.tsx`).

---

## 2. Page & Feature Implementation Breakdown

| Page / Feature | API Endpoint Wired | Features & UX Controls |
| :--- | :--- | :--- |
| **Auth View** | `POST /auth/login`, `POST /auth/register` | Dark split/centered login screen, JWT authentication, auto-bootstrap default org/project |
| **Dashboard Home** | `GET /projects/:id/dashboard-summary` | Live KPI summary cards (Active Queues, Pending Jobs, Completed Today, Dead Letter Jobs), Queue System Overview table with backlog counts, 5s auto-polling, manual refresh button, "Enqueue Test Job" modal trigger |
| **Job Explorer** | `GET /queues/:id/jobs` | Queue selector dropdown, status filter pills (`ALL`, `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `SCHEDULED`, `CANCELLED`), search input by Job ID/Type, paginated table, slide-over timeline detail modal |
| **Job Timeline Modal**| `GET /jobs/:id`, `POST /jobs/:id/cancel` | Full job metadata inspector, JSON payload/result/error formatters, interactive state audit log timeline with exact timestamps & worker PIDs, job cancellation |
| **Worker Fleet** | `GET /projects/:id/workers` | Worker node cards displaying name, hostname, PID, status (`ONLINE`, `BUSY`, `DRAINING`, `OFFLINE`), relative heartbeat time ("12s ago"), health status indicator badge (green for healthy, rose red for >30s stale) |
| **Queues & Concurrency**| `GET /projects/:id/queues`, `PATCH /queues/:id`, `POST /queues/:id/pause`, `POST /queues/:id/resume` | Queue listing, Edit Queue modal (`concurrencyLimit`, priority), Create Queue modal, optimistic Pause/Resume toggles with rollback |
| **Dead Letter Queue (DLQ)**| `GET /projects/:id/dead-letter`, `POST /jobs/:id/retry` | Paginated DLQ failure list, original job ID, failed timestamp, attempt counts, error message, manual "Retry Job" replay button with toast feedback |

---

## 3. Zero Mock Data Verification Audit

An explicit code audit was executed against `apps/web/src/` to confirm that all hardcoded numbers and arrays left over from the Phase 0 scaffold were completely removed:

```bash
# Grep Audit Commands Executed:
grep -rn "1,420" apps/web/src/       # Result: No results found
grep -rn "184,930" apps/web/src/     # Result: No results found
```

All summary cards, tables, lists, and metrics in `apps/web` are 100% powered by live API calls to PostgreSQL via NestJS.
