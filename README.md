# Production-Inspired Distributed Job Scheduling Platform

A high-throughput, multi-tenant distributed job scheduling and background processing engine built with Node.js, NestJS, PostgreSQL, Prisma ORM, TypeScript, and React (Vite + TailwindCSS).

Inspired by Sidekiq, BullMQ, and Celery, this platform provides atomic job claiming (`SELECT FOR UPDATE SKIP LOCKED`), configurable concurrency limits, flexible retry policies (fixed, linear, exponential), cron & delayed scheduled jobs, worker heartbeats, crashed worker lock recovery, dead letter queue (DLQ) replaying, and a real-time dark-themed monitoring dashboard.

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
│   ├── architecture.md       # Mermaid architecture & sequence diagrams
│   ├── er-diagram.md         # Mermaid ER diagram & schema evolution notes
│   ├── api-spec.json         # Static OpenAPI 3.0 JSON specification
│   ├── DESIGN_DECISIONS.md   # Consolidated technical choices, trade-offs & limitations
│   ├── phase-4-concurrency-proof.md # Multi-worker process proof (50/50 jobs executed, 0 duplicates)
│   └── phase-5-notes.md      # Dashboard API integration notes
├── docker-compose.yml # PostgreSQL 16 docker service
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

## ⚡ Prerequisites

Ensure you have the following installed locally:
- **Node.js**: `v20+` (v23 recommended)
- **pnpm**: `v9+` (`npm install -g pnpm`)
- **Docker & Docker Compose**: For local PostgreSQL database

---

## 🚀 Getting Started

### 1. Clone & Install Dependencies

```bash
git clone <repo-url>
cd distributed-job-scheduler
pnpm install
```

### 2. Start PostgreSQL Database

Start PostgreSQL (port 5432) via Docker Compose:

```bash
docker-compose up -d
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

This launches:
- 🌐 **Web Monitoring Dashboard**: `http://localhost:3000`
- 🚀 **NestJS API Service**: `http://localhost:3001`
- 📚 **Swagger API Docs**: `http://localhost:3001/api/docs`
- ⚡ **Background Worker Daemon**: Poller & Handler Engine

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
# Spawns 3 concurrent Node worker processes polling a shared queue of 50 jobs
pnpm --filter @job-scheduler/worker test:multi
```

---

## 📚 Technical Documentation & Specs

- 📐 **[System Architecture (`docs/architecture.md`)](file:///d:/codilty.ai/docs/architecture.md)**: Component topology, sequence diagrams, and horizontal scale-out guarantees.
- 🗄️ **[Entity-Relationship Diagram (`docs/er-diagram.md`)](file:///d:/codilty.ai/docs/er-diagram.md)**: Visual schema model of all 12 domain entities.
- 📑 **[OpenAPI / Swagger Spec (`docs/api-spec.json`)](file:///d:/codilty.ai/docs/api-spec.json)**: Exported OpenAPI 3.0 specification covering all REST API endpoints.
- 💡 **[Design Decisions (`docs/DESIGN_DECISIONS.md`)](file:///d:/codilty.ai/docs/DESIGN_DECISIONS.md)**: In-depth technical rationale on PostgreSQL `SKIP LOCKED`, polling intervals, retry backoff algorithms, scope trade-offs, and scaling limits.
