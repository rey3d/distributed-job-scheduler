# Production-Inspired Distributed Job Scheduling Platform

A high-throughput, multi-tenant distributed job scheduling and background processing engine built with Node.js, NestJS, PostgreSQL, Prisma ORM, TypeScript, and React (Vite + TailwindCSS).

Inspired by Sidekiq, BullMQ, and Celery, this platform provides atomic job claiming (`SELECT FOR UPDATE SKIP LOCKED`), configurable concurrency limits, flexible retry policies (fixed, linear, exponential), cron & delayed scheduled jobs, worker heartbeats, crashed worker lock recovery, dead letter queue (DLQ) replaying, and a real-time dark-themed monitoring dashboard.

---

## Reviewer quick verification

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm db:generate
pnpm db:push
pnpm test
pnpm --filter @job-scheduler/worker test:multi
```

The final command starts three independent worker processes and passes only if
50 jobs complete exactly once, with zero duplicates, and at least two launched
workers process jobs. See the [multi-worker verification guide](docs/multi-worker-verification.md).

| Evaluation area | Evidence in this repository |
| --- | --- |
| System architecture | [Architecture](docs/architecture.md), Docker Compose, three-worker local startup |
| Database design | [Prisma schema](packages/shared/prisma/schema.prisma), [ER diagram](docs/er-diagram.md), hot-path indexes |
| Backend engineering | NestJS modules, JWT authentication, validation, pagination, structured errors and request logging |
| Reliability & concurrency | Atomic `SKIP LOCKED` claims, shared queue-concurrency enforcement, retries, DLQ, heartbeats, stale-lock recovery |
| Frontend & UX | Responsive dashboard for queues, jobs, DLQ, system health and worker fleet |
| API design | Swagger UI at `/api/docs` and [OpenAPI specification](docs/api-spec.json) |
| Documentation | Architecture, ER model, scaling, design decisions and verification guides |
| Testing | `pnpm test` and the automated three-worker proof |

---

## 🏗️ Monorepo Architecture Layout

This project is organized as a `pnpm` workspace monorepo:

```
distributed-job-scheduler/
├── apps/
│   ├── api/          # NestJS REST API service (Port 3001)
│   ├── worker/       # Standalone Node.js background worker process
│   └── web/          # React + Vite + TailwindCSS monitoring dashboard (Port 3000)
├── packages/
│   └── shared/       # Prisma schema, job engine (atomic claim, state machine, retries, DLQ)
├── docs/
│   ├── scaling.md            # Multi-worker deployment & horizontal scaling guide
│   ├── architecture.md       # Mermaid architecture & sequence diagrams
│   ├── er-diagram.md         # Mermaid ER diagram & schema evolution notes
│   ├── api-spec.json         # Static OpenAPI 3.0 JSON specification
│   ├── DESIGN_DECISIONS.md   # Consolidated technical choices, trade-offs & limitations
│   ├── phase-4-concurrency-proof.md # Multi-worker process proof (50/50 jobs executed, 0 duplicates)
│   └── phase-5-notes.md      # Dashboard API integration notes
├── docker-compose.yml        # Full container stack (PostgreSQL, Redis, API, 3x Worker Replicas, Web Dashboard)
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

## ⚡ Prerequisites

Ensure you have the following installed locally:
- **Node.js**: `v20+` (v23 recommended)
- **pnpm**: `v9+` (`npm install -g pnpm`)
- **Docker & Docker Compose**: For local stack execution

## 🔐 Configuration

Copy `.env.example` to `.env` and replace the example values before running a
production-like stack. `JWT_SECRET` and `POSTGRES_PASSWORD` are mandatory for
Docker deployments; `CORS_ORIGIN` must name the dashboard origin(s), separated
by commas when more than one is used.

---

## 🚀 Multi-Worker Deployment & Quick Start

### Option 1: Launch Full Container Stack with 3 Worker Replicas (Recommended)

```bash
# Build and start PostgreSQL, Redis, API, 3x Worker Replicas, and Web Dashboard
docker-compose up -d --build

# Scale to 5 worker replicas dynamically
docker-compose up -d --scale worker=5
```

### Option 2: Local Development Execution

```bash
# 1. Start PostgreSQL & Redis
docker-compose up -d postgres redis

# 2. Push database schema
pnpm --filter @job-scheduler/shared db:push

# 3. Start API, Worker, and Web UI concurrently
pnpm dev
```

### 3. Database Setup & Migrations

Generate the Prisma Client types and run database migrations:

```bash
# Push Prisma schema to PostgreSQL database
pnpm --filter @job-scheduler/shared db:push

# (Optional) Launch Prisma Studio GUI
pnpm --filter @job-scheduler/shared db:studio
```

---

## 🏃 Running the Application

### Option A: Run All Services Concurrently (API + Worker + Web Dashboard)

From the monorepo root:

```bash
pnpm dev
```

This launches one API, one web dashboard, and **three independent worker processes**:
- 🌐 **Web Monitoring Dashboard**: `http://localhost:3000`
- 🚀 **NestJS API Service**: `http://localhost:3001`
- 📚 **Swagger API Docs**: `http://localhost:3001/api/docs`
- ⚡ **Background Worker Daemons (3)**: Poller & Handler Engine; visible in Worker Fleet

---

### Option B: Run Services Individually

```bash
# Start NestJS API Service only
pnpm --filter @job-scheduler/api dev

# Start Background Worker Process only
pnpm --filter @job-scheduler/worker dev

# Start Web Monitoring Dashboard only
pnpm --filter @job-scheduler/web dev
```

---

## 🧪 Testing & Verification

### Run Full Test Suite Across Monorepo

```bash
# Run tests across shared core, api layer, and worker engine
pnpm test
```

### Run Multi-Instance Concurrency Proof (3 Independent Worker Daemon Processes)

```bash
# Requires a running PostgreSQL instance and DATABASE_URL in .env.
# Spawns 3 OS worker processes polling one shared queue of 50 jobs.
pnpm --filter @job-scheduler/worker test:multi
```

The command exits non-zero unless every job completes exactly once and at least
two of its launched worker instances process the workload. See
[`docs/multi-worker-verification.md`](docs/multi-worker-verification.md) for
the expected evidence and Docker alternative.

---

## 📚 Technical Documentation & Specs

- 📐 **[System Architecture](docs/architecture.md)**: Component topology, sequence diagrams, and horizontal scale-out guarantees.
- 🗄️ **[Entity-Relationship Diagram](docs/er-diagram.md)**: Visual schema model of all domain entities.
- 📑 **[OpenAPI / Swagger Spec](docs/api-spec.json)**: Exported OpenAPI 3.0 specification covering REST endpoints.
- 💡 **[Design Decisions](docs/DESIGN_DECISIONS.md)**: Technical rationale, trade-offs, and scaling limits.
