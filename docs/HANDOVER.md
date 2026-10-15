# Octalve Edu — Project Status & Handover Documentation

> **Last Updated:** 2026-10-15  
> **Scope:** Octalve Edu Multi-Tenant School Management SaaS (Canonical Reference Architecture)  
> **Repository:** `octalve-core/octalve-edu`  
> **Active Branch:** `claude/phase-2-docs-and-handover` (Base: `dev`)

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

## 2. Completed Phase 1 Delivery Register

All Phase 1 milestones and post-phase hardening are fully implemented, verified, and landed on `octalve-core` `dev`:

| Milestone | Task | Description | PR | Verification |
|---|---|---|---|---|
| 1 | TASK-0001 | Phase 1.2: People & Enrolment (Option B duplicate override + ADR 0014) | [PR #11](https://github.com/roji-tech/octalve-edu-fork/pull/11) | 1,603 tests green |
| 2 | TASK-0002 | Phase 1.3: Attendance & Touch Grid Operations | [PR #12](https://github.com/roji-tech/octalve-edu-fork/pull/12) | Green |
| 3 | TASK-0003 | Phase 1.4: Results, Grading & Publishing Workflow | [PR #13](https://github.com/roji-tech/octalve-edu-fork/pull/13) | Green |
| 4 | TASK-0004 | Phase 1.5: Finance, Invoicing & Dual-Mode Paystack Integration | [PR #14](https://github.com/roji-tech/octalve-edu-fork/pull/14) | 267 unit, 66 RLS, 9 API |
| 5 | TASK-0005 | Phase 1.6: Announcements Broadcast & Timetable Scheduling | [PR #15](https://github.com/roji-tech/octalve-edu-fork/pull/15) | 287 unit, 66 RLS, 20 API |
| 6 | TASK-0006 | Phase 1.7: Settings UI, Step-up MFA & Audit Logging | [PR #16](https://github.com/roji-tech/octalve-edu-fork/pull/16) | 294 unit, 68 RLS, 15 API |
| 7 | TASK-0007 | Phase 1.8: End-to-End Hardening, Security Walk & Quality Gate | [PR #17](https://github.com/roji-tech/octalve-edu-fork/pull/17) | Full security walk green |
| 8 | TASK-0008 | Post-Phase-1 verification and defect fixes | [PR #6](https://github.com/octalve-core/octalve-edu/pull/6) | 1,757 passed / 0 failed |
| 9 | TASK-0009 | Campus administrators & Platform Superadmin (ADR 0016) | [PR #7](https://github.com/octalve-core/octalve-edu/pull/7) | 1,842 passed / 0 failed |
| 10 | TASK-0010 | Platform follow-ups: counters, re-invites, attendance scoping | [PR #8](https://github.com/octalve-core/octalve-edu/pull/8) | 1,927 passed / 0 failed |
| 11 | TASK-0011 | Audited support access (ADR 0017) & follow-ups status | [PR #14](https://github.com/octalve-core/octalve-edu/pull/14) / [PR #15](https://github.com/octalve-core/octalve-edu/pull/15) | 1,972 passed / 0 failed |

---

## 3. Production Deployment Checklist & Run Order

Before promoting changes to live production, adhere strictly to this execution sequence:

1. **Pre-Deploy Database Migrations:**
   - Execute migrations **before** deploying new application code (all are additive):
     - `20261024090000_support_grants`
     - `20261024100000_support_session`
   - *Rule 9 Guard:* Never invoke `app_grant_runtime_privileges()` in migrations (it resets runtime privileges).
2. **Pre-Deploy Staff Scoping Audit:**
   - For each live school, execute:
     ```bash
     pnpm teachers:unassigned -- <school-code>
     ```
   - Identify active teaching staff who lack arm assignments under the new attendance rule (TASK-0010) and have school administrators assign them before the release.

---

## 4. Phase 2: Communication & Multi-Channel Messaging Engine

> **Status:** Architecture specified in `docs/tasks/0012-phase-2-communication-and-messaging.md`. Implementation commencing.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Phase 2 Architecture                            │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  [Domain Event Hooks]                                                  │
│   ├─ Absence Marked ──────┐                                            │
│   ├─ Results Published ───┼─► [Event Bus]                              │
│   └─ Invoice Generated ───┤          │                                 │
│                           │          ▼                                 │
│  [Ad-hoc Broadcasts] ─────┘    [BullMQ Queue] (Redis backed)           │
│                                      │                                 │
│                                      ▼                                 │
│                           [Template Engine]                            │
│                           (Variable Interpolation)                     │
│                                      │                                 │
│          ┌───────────────────────────┼───────────────────────────┐     │
│          ▼                           ▼                           ▼     │
│  [Resend Adapter]             [Termii Adapter]          [In-App Store] │
│      (Email)                  (SMS & WhatsApp)             (Feed)      │
│          │                           │                           │     │
│          └───────────────────────────┼───────────────────────────┘     │
│                                      ▼                                 │
│                           [Notification Audit Log]                    │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Core Sub-systems:
1. **Template Engine:** Supports Mustache-style interpolation (`{{student_name}}`, `{{class_arm}}`, `{{school_name}}`), channel-specific formatting, and system templates.
2. **BullMQ on Redis:** Priority queues for immediate alerts (absences), throttled batch queues for announcements, exponential retry with jitter, dead-letter logging.
3. **Multi-Channel Transports:**
   - **Email:** Resend HTTP client with dev inbox fallback.
   - **SMS & WhatsApp:** Termii API client with E.164 normalization (+234 format) and mock simulator in non-production.
4. **Guardian-Link Engine:** Cryptographically signed, short-lived magic tokens for frictionless parent access to absence notes and payment pages.
5. **Security & Isolation:** Strict RLS enforcement across `NotificationTemplate`, `NotificationDispatch`, and `GuardianLinkToken`.

---

## 5. Verification & Test Suite Health

- **Suite Status:** 1,972 tests passing, 0 failures, 23 documented design skips.
- **Hydration & Shell Timing:** Flakes resolved via `waitForHydration` helper (`tests/e2e/helpers.ts`).
- **Mutation Passes:** Scheduled across all modules at the conclusion of Phase 2.
