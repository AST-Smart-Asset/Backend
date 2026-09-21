# Smart Asset Inventory & Predictive Maintenance (AST) — Backend API Service

[![CI Status](https://github.com/AST-Smart-Asset/Backend/actions/workflows/ci.yml/badge.svg)](https://github.com/AST-Smart-Asset/Backend/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org)

Backend service for **Project 3: Smart Asset Inventory & Predictive Maintenance**, developed for Badr University in Assiut (BUA) DevHub Field Phase. Provides a unified asset registry, multi-level location hierarchy, auditable custody movements, maintenance work orders, QR stocktake reconciliation, and explainable predictive risk analytics.

---

## 🏛️ System Architecture & 12-Table ERD

```
Identity & Access       Asset Registry                  Maintenance & Lifecycle        Security & Evidence
[org_units]             [locations]                     [maintenance_templates]        [asset_documents]
[users]                 [asset_categories]              [work_orders]                  [asset_events]
[roles]                 [assets]                        [stocktake_sessions]           [audit_log]
[user_roles]                                            [stocktake_observations]
```

### Key Security & Architectural Principles
- **Organizational-Scope RBAC**: College and department managers are restricted to their authorized organizational tree (`org_unit_id` and descendants).
- **Append-Only Immutability**: All movements, check-ins/outs, and status changes are permanently recorded in `asset_events` and `audit_log`. Custody history cannot be rewritten.
- **Private Document Vault**: Procurement invoices and warranty certificates are stored in private object storage (no public URLs). Downloads require time-bound cryptographic tokens (valid for 5 minutes).
- **Deterministic AI Baseline**: Asset failure predictions utilize an explainable rules engine (due proximity, useful life ratio, failure frequency, downtime) with safe human-in-the-loop review.

---

## 🚀 Quick Start (Docker Compose)

Start the entire stack (PostgreSQL 16 database + Backend API) with a single command:

```bash
docker-compose up -d --build
```

- **REST API**: `http://localhost:5000/api/v1`
- **Interactive Swagger Documentation**: `http://localhost:5000/docs`
- **Health Check**: `http://localhost:5000/health`

---

## 🛠️ Local Development Setup

### 1. Prerequisites
- Node.js >= 20.x
- PostgreSQL 16
- npm or pnpm

### 2. Installation
```bash
git clone https://github.com/AST-Smart-Asset/Backend.git
cd Backend
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env` and configure your database connection string:
```bash
cp .env.example .env
```

### 4. Database Migration & Synthetic Seed Generator
Generate Prisma client, apply database schema, and seed 110+ assets across 2 buildings:
```bash
npx prisma generate
npx prisma db push
npm run db:seed
```

### 5. Start Development Server
```bash
npm run dev
```

---

## 👥 Seeded Demo Accounts (Password: `Password123!`)

| Email | Role | Scope | Permitted Actions |
|---|---|---|---|
| `admin@bua.edu.eg` | `super_admin` | Global (All Campuses) | Full system administration, role grants, system configuration |
| `asset.manager@bua.edu.eg` | `asset_admin` | Faculty of AI & Data Management | Asset registration, CSV batch import, transfers, retirement |
| `procurement@bua.edu.eg` | `procurement_finance` | Global | Invoice & warranty management, procurement linking, cost reports |
| `custodian.ai@bua.edu.eg` | `custodian_manager` | AI Department | View scope inventory, accept custody transfers, check-in/out |
| `technician@bua.edu.eg` | `technician` | Global (Maintenance) | View assigned work orders, record service, downtime, parts cost |
| `auditor@bua.edu.eg` | `auditor` | Read-Only (Global) | Audit trail inspection, stocktake sessions, exception reports |

---

## 📡 Core API Specification (`/api/v1`)

| Module | Requirement ID | Method | Endpoint | Description |
|---|---|---|---|---|
| **Auth** | - | `POST` | `/api/v1/auth/login` | Authenticate user & issue JWT access and refresh tokens |
| **Auth** | - | `GET` | `/api/v1/auth/me` | Fetch active user profile and scoped roles |
| **Locations** | `AST-FR-01` | `GET` | `/api/v1/locations` | Hierarchical locations list (Campus → Building → Floor → Room) |
| **Locations** | `AST-FR-01` | `POST` | `/api/v1/locations` | Create location node within authorized org unit |
| **Assets** | `AST-FR-02` | `GET` | `/api/v1/assets` | Paginated asset registry with filters (status, condition, risk) |
| **Assets** | `AST-FR-02` | `POST` | `/api/v1/assets` | Register single tagged asset with duplicate tag/serial detection |
| **Assets** | `AST-FR-02` | `POST` | `/api/v1/assets/import` | Bulk CSV/JSON import with per-row duplicate and validation error report |
| **Documents** | `AST-FR-03` | `POST` | `/api/v1/documents` | Upload invoice/warranty metadata & store encrypted in private vault |
| **Documents** | `AST-FR-03` | `GET` | `/api/v1/documents/:id/download-token` | Issue 5-minute ephemeral signed download token |
| **Documents** | `AST-FR-03` | `GET` | `/api/v1/documents/download?token=...` | Stream authorized private document without public URL |
| **Custody** | `AST-FR-04` | `POST` | `/api/v1/custody/:assetId/transfer` | Move asset between locations/custodians with immutable event log |
| **Custody** | `AST-FR-04` | `GET` | `/api/v1/custody/:assetId/history` | Retrieve complete chronological movement timeline |
| **Maintenance**| `AST-FR-05` | `GET` | `/api/v1/maintenance/templates` | List preventive maintenance templates and checklist triggers |
| **Work Orders**| `AST-FR-06` | `POST` | `/api/v1/work-orders` | Schedule preventive/corrective work order |
| **Work Orders**| `AST-FR-06` | `POST` | `/api/v1/work-orders/:id/close` | Complete service, record downtime/cost, and recalculate next due date |
| **Stocktake** | `AST-FR-07` | `POST` | `/api/v1/stocktake/sessions` | Initialize physical QR audit session for a location |
| **Stocktake** | `AST-FR-07` | `POST` | `/api/v1/stocktake/sessions/:id/scan`| Record QR scan; classify asset as verified, moved, or unexpected |
| **Stocktake** | `AST-FR-07` | `GET` | `/api/v1/stocktake/sessions/:id/report`| Generate reconciled discrepancy report with missing assets list |
| **Dashboard** | `AST-FR-08` | `GET` | `/api/v1/dashboard/kpis` | Role-scoped reconciled KPIs (count, value, condition, overdue, downtime) |
| **Predictions**| `AST-FR-09` | `POST` | `/api/v1/predictions/evaluate/:assetId`| Advisory failure risk evaluation with explainable reasons |
| **Predictions**| `AST-FR-09` | `GET` | `/api/v1/predictions/model-card` | AI Model Card, baseline metrics, and fallback documentation |
| **Disposal** | `AST-FR-10` | `POST` | `/api/v1/disposal/:assetId/retire` | Formally retire/dispose asset; locks record permanently to read-only |
| **Audit** | - | `GET` | `/api/v1/audit/logs` | Review compliance audit log with actor ID, IP, and sanitized payload |

---

## 🧪 Testing

Execute automated unit and integration tests:
```bash
npm test
```

---

## 📄 License & Squad Attribution
- **Squad**: Squad 3 (Platform Pod: Backend, DevOps, Security)
- **Repository**: [AST-Smart-Asset/Backend](https://github.com/AST-Smart-Asset/Backend)
- **License**: MIT