# Octalve Edu — Project Status & Handover Documentation

> **Last Updated:** 2026-10-18  
> **Scope:** Octalve Edu Multi-Tenant School Management SaaS (Canonical Reference Architecture)  
> **Repository:** `octalve-core/octalve-edu`  
> **Active Branch:** `dev` (Synchronized with `master`)

---

## 1. Executive Summary & Multi-Tenant SaaS Architecture

Octalve Edu is the multi-tenant SaaS canonical implementation of the Octalve Core education platform. It powers both hosted multi-tenant educational institutions (`DEPLOYMENT_MODE=saas`) and dedicated single-school installations (`DEPLOYMENT_MODE=solo`).

### Non-Negotiable Architectural Tenets:
1. **PostgreSQL Row-Level Security (RLS):**
   - The application runtime connects strictly as the unprivileged PostgreSQL role `app_user` (never the table owner or superuser).
   - Every tenant-scoped table enforces `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
   - The catalog guard (`tests/integration/tenant-rls.spec.ts`) continuously asserts that every table with a `tenantId` column has forced RLS and valid policies.
   - Tenant resolution sets `app.tenant_id` transaction-locally (`set_config(..., true)`).
2. **Authority Hierarchy (ADR 0016):**
   - `Platform Superadmin`: `User.isPlatformAdmin = true`. Cross-school operations via narrow `SECURITY DEFINER` functions; **zero direct read access** to tenant data.
   - `School Admin`: `TenantMembership.role = ADMIN`. Unrestricted authority across all campuses within their own school.
   - `Campus Admin`: `TenantMembership.role = CAMPUS_ADMIN` (with required `campusId`). Scoped exclusively to their physical campus; blocked from school-wide settings, other campuses, and admin management.
   - `Staff`, `Students`, `Guardians`: Standard tenant members.
3. **Audited Support Access (ADR 0017):**
   - A school `ADMIN` may grant time-limited, area-scoped, read-only support access to platform administrators.
   - Every request is logged in both the school's `AuditLog` and the platform's `PlatformAuditLog`.
   - Finance is strictly excluded from support view reach.

---

## 2. Completed Delivery Register (Phases 1 through 5 + Extended HR)

All foundational and expansion phases are 100% implemented, verified, landed on `master`, and deployed to live production databases:

| Milestone | Task | Description | PR / Release | Status |
|---|---|---|---|---|
| 1 | TASK-0001 | Phase 1.2: People & Enrolment (Option B duplicate override + ADR 0014) | [PR #11](https://github.com/roji-tech/octalve-edu-fork/pull/11) | Landed |
| 2 | TASK-0002 | Phase 1.3: Attendance & Touch Grid Operations | [PR #12](https://github.com/roji-tech/octalve-edu-fork/pull/12) | Landed |
| 3 | TASK-0003 | Phase 1.4: Results, Grading & Publishing Workflow | [PR #13](https://github.com/roji-tech/octalve-edu-fork/pull/13) | Landed |
| 4 | TASK-0004 | Phase 1.5: Finance, Invoicing & Dual-Mode Paystack Integration | [PR #14](https://github.com/roji-tech/octalve-edu-fork/pull/14) | Landed |
| 5 | TASK-0005 | Phase 1.6: Announcements Broadcast & Timetable Scheduling | [PR #15](https://github.com/roji-tech/octalve-edu-fork/pull/15) | Landed |
| 6 | TASK-0006 | Phase 1.7: Settings UI, Step-up MFA & Audit Logging | [PR #16](https://github.com/roji-tech/octalve-edu-fork/pull/16) | Landed |
| 7 | TASK-0007 | Phase 1.8: End-to-End Hardening, Security Walk & Quality Gate | [PR #17](https://github.com/roji-tech/octalve-edu-fork/pull/17) | Landed |
| 8 | TASK-0008 | Post-Phase-1 verification and defect fixes | [PR #6](https://github.com/octalve-core/octalve-edu/pull/6) | Landed |
| 9 | TASK-0009 | Campus administrators & Platform Superadmin (ADR 0016) | [PR #7](https://github.com/octalve-core/octalve-edu/pull/7) | Landed |
| 10 | TASK-0010 | Platform follow-ups: counters, re-invites, attendance scoping | [PR #8](https://github.com/octalve-core/octalve-edu/pull/8) | Landed |
| 11 | TASK-0011 | Audited support access (ADR 0017) & follow-ups status | [PR #14](https://github.com/octalve-core/octalve-edu/pull/14) / [PR #15](https://github.com/octalve-core/octalve-edu/pull/15) | Landed |
| 12 | TASK-0012 | Phase 2: Communication & Multi-Channel Messaging Engine | [PR #18](https://github.com/octalve-core/octalve-edu/pull/18) | Landed |
| 13 | TASK-0013 | Phase 3: Global Quick-Tools Dock & Progressive Web App (PWA) | [PR #19](https://github.com/octalve-core/octalve-edu/pull/19) | Landed |
| 14 | TASK-0014 | Phase 4: Learning Management System (LMS) & Online Assignments | [PR #20](https://github.com/octalve-core/octalve-edu/pull/20) | Landed |
| 15 | TASK-0015 | Phase 5: Higher-Ed Credit Unit System, Domains & Vocational Certs | [PR #21](https://github.com/octalve-core/octalve-edu/pull/21) | Landed |
| 16 | Releases | Production Staging & Releases v1.0.0 & v1.0.1 | [PR #22](https://github.com/octalve-core/octalve-edu/pull/22), #23, #25, #26 | Tagged `v1.0.1` |
| 17 | TASK-0016 | Extended Staff HR & Guardian Fields (`middleName`, `Gender`, `dateOfBirth`, `nextOfKin*`, etc.) | [PR #27](https://github.com/octalve-core/octalve-edu/pull/27) (`dev`), [PR #28](https://github.com/octalve-core/octalve-edu/pull/28) (`master`) | Landed |

---

## 3. Database Migrations Status (100% Deployed & Synchronized)

All 31 database migrations are fully applied across development and production environments:

- **Local Docker Database:** `postgresql://octalve:octalve@localhost:5433/octalve_edu` — 31 migrations applied.
- **Live Remote Database:** `postgres://...:5432/postgres?sslmode=require` (`db.prisma.io:5432`) — 31 migrations applied.
- **Latest Migration Applied:** `20261028090000_staff_and_guardian_extended_fields/migration.sql`

---

## 4. Architectural Blueprint: Phase 4 Operations & Admissions CRM

A detailed technical blueprint is documented in:
👉 **[`docs/tasks/0016-phase-4-operations-and-admissions-blueprint.md`](docs/tasks/0016-phase-4-operations-and-admissions-blueprint.md)**

### Modules Ready for Implementation:
1. **Extended HR & Payroll:**
   - Multi-tenant salary structures, allowances, statutory deductions (PITA PAYE, Pension Reform Act 2014, NHF 2.5%).
   - Monthly payroll runs (`DRAFT` ➔ `CALCULATING` ➔ `PENDING_APPROVAL` ➔ `DISBURSED`), immutable JSON payslips.
2. **Library Management:**
   - ISBN cataloging, Dewey Decimal numbers, copy barcode inventory tracking (`AVAILABLE`, `CHECKED_OUT`, `LOST`).
   - Automated overdue fine accrual attaching to the SIS student billing ledger.
3. **Transport & Fleet Operations:**
   - Fleet vehicles, maintenance/insurance tracking, ordered bus route stops, passenger manifests, term transport subscription fees.
4. **Inventory & Asset Management:**
   - Capital fixed assets (lab equipment, classroom furniture) vs. consumable inventory (uniforms, exercise books with minimum stock threshold alerts). Requisitions and dispatch logs.
5. **Government / NEMIS Reporting:**
   - Automated statutory census exports for the Federal Ministry of Education (FME), Universal Basic Education Commission (UBEC/NPA), and state ministries.
6. **Admissions Pipeline & CRM (PRD §6 Line 113):**
   - Public online application form with tokenized tracking and document uploads.
   - Entrance exams, interview scoring rubrics, offer letters, waitlist ranking engine.
   - **Zero-Rekeying Promotion Engine:** Atomic conversion of accepted applicants directly into permanent `StudentRecord`, `GuardianRecord`, and portal credentials with zero duplicate entry.

---

## 5. Verification & Test Suite Health

- **Suite Status:** 1,972+ tests passing, 0 failures, 23 documented design skips.
- **RLS Guard:** `tests/integration/tenant-rls.spec.ts` verifies all tenant tables enforce Postgres Row-Level Security.
- **Cross-Tenant Guard:** `tests/api/tenant-boundary.spec.ts` executes automated IDOR attacks on every tenant-scoped endpoint.
