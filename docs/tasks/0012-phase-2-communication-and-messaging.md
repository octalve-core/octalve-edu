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
- [ ] Additive migration `20261025090000_communication_engine`:
  - `NotificationTemplate`: `(id, tenantId, code, name, channel, subjectTemplate?, bodyTemplate, variablesJson, isSystem, createdAt, updatedAt)`.
  - `NotificationDispatch`: `(id, tenantId, templateId?, channel, recipientAddress, recipientUserId?, status [QUEUED, PROCESSING, SENT, FAILED, RETRYING], attempts, lastError, sentAt, createdAt)`.
  - `GuardianLinkToken`: `(id, tenantId, studentId, guardianId?, tokenHash, expiresAt, usedAt, channel)`.
  - `NotificationAuditLog`: append-only dispatch audit trail.
  - Composite unique indexes and RLS policies for `app_user` on every table.
  - Catalog guard verification in `tests/integration/tenant-rls.spec.ts`.

### Slice B: BullMQ Queue Infrastructure (`src/lib/queue/`)
- [ ] Redis connection factory: reuse existing `ioredis` client configuration (`REDIS_URL`).
- [ ] Queue definitions:
  - `notification-dispatch-queue`: prioritized workers for immediate event triggers (e.g., student absence).
  - `bulk-broadcast-queue`: throttled worker queue for school-wide campaigns.
- [ ] Worker lifecycle & retry engine:
  - Exponential backoff (3 retries with jitter).
  - Dead-letter handling: failed dispatches marked `FAILED` with sanitized error message.

### Slice C: Template Engine & Variable Interpolation (`src/lib/communication/templates.ts`)
- [ ] Pure template interpolation function:
  - Safe replacement of tokens (e.g., `{{student_name}}`, `{{class_arm}}`, `{{term_name}}`, `{{date}}`, `{{school_name}}`).
  - Strict escaping to prevent XSS in email and message corruption in SMS.
- [ ] Standard system templates:
  - `ATTENDANCE_ABSENCE`: Instant alert when student marked absent.
  - `RESULTS_PUBLISHED`: Term report card available notification with secure link.
  - `FEE_INVOICE_ISSUED`: New invoice billing notification.
  - `FEE_OVERDUE_REMINDER`: Payment reminder before term deadlines.
  - `BROADCAST_ANNOUNCEMENT`: General broadcast message.

### Slice D: Multi-Channel Gateway Adapters (`src/lib/communication/gateways/`)
- [ ] Email Adapter:
  - Resend REST integration with batch send support.
- [ ] Termii SMS & WhatsApp Adapter:
  - Pure HTTP client communicating with Termii API.
  - Dual-mode architecture: real API in production, mock adapter when `TERMII_API_KEY` is unset or in test environments.
  - Phone number normalization (E.164 formatting for Nigerian MSISDNs: `+234...`).
- [ ] In-App Notification Feed:
  - User notification state table (`readAt`, `dismissedAt`).

### Slice E: Guardian-Link Messaging Engine (`src/lib/communication/guardian-link.ts`)
- [ ] Single-use, cryptographically signed magic links for guardians.
- [ ] Allows guardians to view specific student notices, daily attendance summaries, or invoice payment pages without friction.
- [ ] Token expiry enforcement (e.g., 72-hour window) and tamper-proof SHA-256 HMAC verification.

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
- Mutation pass: Scheduled with Phase 2 conclusion.
