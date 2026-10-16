# [0012]: Phase 2 — Communication & Multi-Channel Messaging Engine

- **Period / Focus:** Phase 2 (PRD §5.5, PRD §7; roadmap milestone)
- **Status:** [~] In Progress - Architecture & Task Design Specified; Implementation Commencing
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/phase-2-communication` -> `dev`
- **Started:** 2026-10-15 UTC
- **Ended:** —
- **Duration:** —

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Build an enterprise-grade, multi-tenant communication and messaging subsystem for Octalve Edu. Enables schools to broadcast targeted announcements and dispatch event-driven automated notifications across multiple channels: Email (via Resend), SMS (via Termii), WhatsApp (via Termii WhatsApp Business API), and In-App feeds. Features asynchronous job processing via BullMQ on Redis, template variable interpolation, guardian-link direct access, and strict tenant isolation via Row-Level Security (`app_user`).

---

## 2. Context & Related Architecture

- **Multi-Tenant RLS Guarantee:** Every communication table enforces PostgreSQL Row-Level Security (`ENABLE` and `FORCE`) bound to `app_tenant_id()`. The runtime role `app_user` cannot access another school's templates, message queue rows, or delivery logs.
- **Asynchronous Queue Infrastructure:** Delivery dispatches must never block HTTP request handlers. BullMQ over Redis provides worker job processing, retry backoff, exponential delays, dead-letter queue (DLQ) tracking, and per-tenant rate-limiting.
- **Fail-Safe Gateways:** 
  - Email: Resend HTTP API (`lib/email/transport.ts`).
  - SMS & WhatsApp: Termii API client (`lib/communication/termii.ts`) with DND routing options and mock delivery in development/staging.
  - Development mode respects `devToolsEnabled()`: outgoing dispatches captured in the dev inbox widget when external credentials are absent.

---

## 3. Work Breakdown

### Slice A: Schema & Migrations (`prisma/schema/communication.prisma`)
- [x] Additive migration `20261025090000_communication_engine`:
  - `NotificationTemplate`: `(id, tenantId, code, name, channel, subjectTemplate?, bodyTemplate, variablesJson, isSystem, createdAt, updatedAt)`.
  - `NotificationDispatch`: `(id, tenantId, templateId?, channel, recipientAddress, recipientUserId?, status [QUEUED, PROCESSING, SENT, FAILED, RETRYING], attempts, lastError, sentAt, createdAt)`.
  - `GuardianLinkToken`: `(id, tenantId, studentId, guardianId?, tokenHash, expiresAt, usedAt, channel)`.
  - `NotificationAuditLog`: append-only dispatch audit trail.
  - Composite unique indexes and RLS policies for `app_user` on every table.
  - Catalog guard verification in `tests/integration/rls.spec.ts` (68/68 passed).
  - Integration test suite `tests/integration/communication-rls.spec.ts` (6/6 passed).

### Slice B: BullMQ Queue Infrastructure (`src/lib/queue/`)
- [x] Redis connection factory: reuse existing `ioredis` client configuration (`REDIS_URL`) in `src/lib/queue/redis.ts`.
- [x] Queue definitions:
  - `notification-dispatch-queue`: prioritized workers for immediate event triggers (e.g., student absence).
  - `bulk-broadcast-queue`: throttled worker queue for school-wide campaigns.
- [x] Worker lifecycle & retry engine:
  - Exponential backoff (3 retries with jitter).
  - Dead-letter handling: failed dispatches marked `FAILED` with sanitized error message.
  - Multi-tenant PostgreSQL RLS context enforcement via `forTenant`.
  - Integration test suite: `tests/integration/communication-queue.spec.ts` (6/6 passed).

### Slice C: Template Engine & Variable Interpolation (`src/lib/communication/templates.ts`)
- [x] Pure template interpolation function:
  - Safe replacement of tokens (e.g., `{{student_name}}`, `{{class_arm}}`, `{{term_name}}`, `{{date}}`, `{{school_name}}`).
  - Strict escaping to prevent XSS in email and message corruption in SMS.
- [x] Standard system templates:
  - `ATTENDANCE_ABSENCE`: Instant alert when student marked absent.
  - `RESULTS_PUBLISHED`: Term report card available notification with secure link.
  - `FEE_INVOICE_ISSUED`: New invoice billing notification.
  - `FEE_OVERDUE_REMINDER`: Payment reminder before term deadlines.
  - `BROADCAST_ANNOUNCEMENT`: General broadcast message.
  - Idempotent tenant seeding `ensureSystemTemplates`.
  - Unit test suite: `tests/unit/communication-templates.spec.ts` (9/9 passed).

### Slice D: Multi-Channel Gateway Adapters (`src/lib/communication/gateways/`)
- [x] Email Adapter (`src/lib/communication/gateways/email.ts`):
  - Resend REST integration with batch send support and dev inbox fallback.
- [x] Termii SMS & WhatsApp Adapter (`src/lib/communication/gateways/termii.ts`):
  - Pure HTTP client communicating with Termii API.
  - Dual-mode architecture: real API in production, mock adapter when `TERMII_API_KEY` is unset or in test environments.
  - Nigerian phone number normalization (`normalizeNigerianPhoneNumber` -> `234...`).
- [x] In-App Notification Feed (`src/lib/communication/gateways/in-app.ts`):
  - Delivery and retrieval for user feeds under tenant RLS.
- [x] Unified dispatcher (`src/lib/communication/gateways/dispatcher.ts`):
  - Universal routing by channel.
  - Unit test suite: `tests/unit/communication-gateways.spec.ts` (11/11 passed).

### Slice E: Guardian-Link Messaging Engine (`src/lib/communication/guardian-link.ts`)
- [x] Single-use, cryptographically signed magic links for guardians (`GuardianLinkToken`).
- [x] Allows guardians to view specific student notices, daily attendance summaries, or invoice payment pages without friction.
- [x] Token expiry enforcement (configurable, default 72-hour window) and tamper-proof SHA-256 HMAC verification.
- [x] Multi-tenant isolation verified under RLS.
- [x] Integration test suite: `tests/integration/guardian-link.spec.ts` (4/4 passed).

### Slice F: Automated Domain Event Triggers
- [ ] Attendance Event Hook:
  - Integrated into `src/lib/attendance/service.ts`: marking roll-call with `ABSENT` enqueues notification job if school setting `notifyAbsence` is enabled.
- [ ] Results Event Hook:
  - Integrated into `src/lib/academics/results-workflow.ts`: transition to `PUBLISHED` triggers batch notification to guardians.
- [ ] Finance Event Hook:
  - Integrated into `src/lib/finance/service.ts`: invoice creation enqueues payment notice.

### Slice G: UI Panels & Management Consoles
- [ ] Template Management Panel: `/schools/[code]/communication/templates` (list, preview, edit templates).
- [ ] Broadcast Composer: `/schools/[code]/communication/broadcast` (audience filtering by campus, class arm, or role).
- [ ] Dispatch Log & Analytics: `/schools/[code]/communication/logs` (delivery statuses, failure diagnostic viewer).
- [ ] Shell Navigation: add "Communication" entry to navigation with phone tab considerations.

### Slice H: Verification & Quality Gates
- [ ] Unit tests: template variable interpolation, phone number sanitization, token generation.
- [ ] Integration tests: queue job processing, retry behavior, RLS isolation across tenants.
- [ ] API tests: route guards, template CRUD, broadcast permissions (Admin / Campus Admin).
- [ ] E2E tests: template editing, broadcast submission, delivery view, dark/light theme, axe accessibility.

---

## 4. Verification Record
 
 - Gate order: `pnpm typecheck` -> `pnpm lint` -> `pnpm format:check` -> `pnpm build` -> `pnpm test`.
 - **Slice A Verification (2026-10-15):**
   - `pnpm exec prisma migrate deploy`: applied `20261025090000_communication_engine`.
   - `pnpm test:fast tests/integration/rls.spec.ts`: 68/68 passed (catalog guard verified all 4 new tables: RLS enabled, forced, app_user policy, NotificationAuditLog append-only revoked UPDATE/DELETE/TRUNCATE).
   - `pnpm test:fast tests/integration/communication-rls.spec.ts`: 6/6 passed (template RLS, dispatch isolation, token isolation, audit immutability, tenant cascade teardown).
   - `pnpm typecheck`: 0 errors.
   - `pnpm lint`: 0 errors.
   - `pnpm format:check`: 0 errors.
   - `pnpm tasks:check`: green across both Octalve Edu and AlEemaan.
 - Mutation pass: Scheduled with Phase 2 conclusion.
