# Current Tasks — Octalve Edu

> **Rule:** How to tick: change `[ ]` to `[x]`. The table shows the characters, not a clickable box.
> All dates and times are recorded in UTC with standard ISO format (`YYYY-MM-DD HH:MM:SS UTC`).
> **Grouping Policy:** Tasks represent cohesive phase-level milestones (design → schema → logic → UI → test → docs → PR) to prevent file proliferation.

---

## Active & Sequential Milestone Register

| # | Task ID | Milestone Title | Status | Started | Ended | PR / Branch |
|---|---|---|---|---|---|---|
| 1 | [TASK-0001](0001-phase-1-2-people-and-enrolment.md) | Phase 1.2: People & Enrolment (Option B duplicate override + ADR 0014) | [x] Completed | 2026-10-07 09:00:00 UTC | 2026-10-09 09:06:17 UTC | [PR #11](https://github.com/roji-tech/octalve-edu-fork/pull/11) (`claude/phase-1-2-people`) |
| 2 | [TASK-0002](0002-phase-1-3-attendance.md) | Phase 1.3: Attendance & Day-to-Day Operations | [x] Completed | 2026-10-09 15:06:00 UTC | 2026-10-09 21:07:00 UTC | [PR #12](https://github.com/roji-tech/octalve-edu-fork/pull/12) (`claude/phase-1-3-attendance`) |
| 3 | [TASK-0003](0003-phase-1-4-results-and-publishing.md) | Phase 1.4: Results, Grading & Publishing Workflow | [x] Completed | 2026-10-09 22:36:00 UTC | 2026-10-09 23:08:00 UTC | [PR #13](https://github.com/roji-tech/octalve-edu-fork/pull/13) (`claude/phase-1-4-results`) |
| 4 | [TASK-0004](0004-phase-1-5-finance-and-billing.md) | Phase 1.5: Finance, Invoicing & Paystack Integration | [x] Completed | 2026-10-10 00:07:00 UTC | 2026-10-10 08:45:00 UTC | [PR #14](https://github.com/roji-tech/octalve-edu-fork/pull/14) (`claude/phase-1-5-finance`) |
| 5 | [TASK-0005](0005-phase-1-6-announcements-and-timetable.md) | Phase 1.6: Announcements & Timetable Scheduling | [x] Completed | 2026-10-10 11:15:00 UTC | 2026-10-10 15:30:00 UTC | [PR #15](https://github.com/roji-tech/octalve-edu-fork/pull/15) (`claude/phase-1-6-timetable`) |
| 6 | [TASK-0006](0006-phase-1-7-settings-and-mfa.md) | Phase 1.7: Settings UI, Step-up MFA & Audit Logging | [x] Completed | 2026-10-10 16:00:00 UTC | 2026-10-10 17:10:00 UTC | [PR #16](https://github.com/roji-tech/octalve-edu-fork/pull/16) (`claude/phase-1-7-settings`) |
| 7 | [TASK-0007](0007-phase-1-8-phase-gate-and-hardening.md) | Phase 1.8: End-to-End Hardening, Security Walk & Gate | [x] Completed | 2026-10-10 17:35:00 UTC | 2026-10-10 19:25:00 UTC | [PR #17](https://github.com/roji-tech/octalve-edu-fork/pull/17) (`claude/phase-1-8-gate`) |

| 8 | [TASK-0008](0008-post-phase-1-verification-and-defect-fixes.md) | Post-Phase-1 verification and defect fixes | [x] Completed (suite 1757 passed / 0 failed / 23 skipped; landed in octalve-core `dev`) | 2026-10-11 UTC | 2026-10-11 UTC | [PR #6](https://github.com/octalve-core/octalve-edu/pull/6) |
| 9 | [TASK-0009](0009-campus-admins-and-platform-superadmin.md) | Campus administrators and the platform superadmin (C1–C8) | [x] Completed (landed in octalve-core `dev`; full suite 1842 passed / 3 failed (shell e2e: the phone one is a pre-existing flake on `dev` too; the two desktop ones unexplained) / 23 skipped) | 2026-10-11 UTC | 2026-10-11 UTC | [PR #7](https://github.com/octalve-core/octalve-edu/pull/7) |
| 10 | [TASK-0010](0010-platform-followups.md) | Platform follow-ups: counters, first-admin re-invite, teachers' attendance scoping, public verification, campus-admin setup controls | [x] Completed (F1-F4 landed in octalve-core `dev` as PR #8, full suite 1927 passed / 1 failed (phone shell flake, family known) / 23 skipped; F5 in `claude/campus-admin-setup-controls`) | 2026-10-11 UTC | — | `claude/platform-followups` |
| 11 | [TASK-0011](0011-audited-support-access.md) | Audited support access (ADR 0017) | [x] Completed (slices A-E; full suite 1972 passed / 4 failed - 2 stale assertions of mine, fixed; landed in octalve-core `dev` as PR #14). Open: 4 follow-ups and the production run order, see the task file §5-6 | 2026-10-13 UTC | 2026-10-14 UTC | `claude/support-access-build` |
| 12 | [TASK-0012](0012-phase-2-communication-and-messaging.md) | Phase 2: Communication & Multi-Channel Messaging Engine (Templates, BullMQ on Redis, Resend/Termii) | [x] Completed | 2026-10-15 UTC | 2026-10-16 09:03:00 UTC | [PR #18](https://github.com/octalve-core/octalve-edu/pull/18) (`claude/phase-2-communication`) |
| 13 | [TASK-0013](0013-global-quick-tools-and-pwa.md) | Phase 3: Global Quick-Tools Dock & Progressive Web App (PWA) | [x] Completed | 2026-10-16 10:00:00 UTC | 2026-10-16 14:00:00 UTC | [PR #19](https://github.com/octalve-core/octalve-edu/pull/19) (`claude/phase-3-quick-tools-pwa`) |
| 14 | [TASK-0014](0014-phase-4-lms-and-assignments.md) | Phase 4: Learning Management System (LMS) & Assignments | [x] Completed | 2026-10-16 14:30:00 UTC | 2026-10-16 15:45:00 UTC | [PR #20](https://github.com/octalve-core/octalve-edu/pull/20) (`claude/phase-4-lms-assignments`) |
| 15 | [TASK-0015](0015-phase-5-expansion-higher-ed-and-domains.md) | Phase 5: Higher-Ed Credit Unit System, Custom Domains & Vocational Certifications | [x] Completed | 2026-10-18 01:00:00 UTC | 2026-10-18 01:30:00 UTC | [PR #21](https://github.com/octalve-core/octalve-edu/pull/21) |
| 16 | Release Staging | Release v1.0.0 Staging: Promote `dev` ➔ `master` (Phases 1-5) | [x] Completed | 2026-10-18 05:14:00 UTC | 2026-10-18 05:15:00 UTC | [PR #22](https://github.com/octalve-core/octalve-edu/pull/22) |
| 17 | Release Production | Release v1.0.0 Production: Promote `master` ➔ `prod` (Tagged `v1.0.0`) | [x] Completed | 2026-10-18 05:15:00 UTC | 2026-10-18 05:16:00 UTC | [PR #23](https://github.com/octalve-core/octalve-edu/pull/23) |
| 18 | [TASK-0011-Followups](0011-audited-support-access.md) | Audited Support Access Enhancements (Named Grantee & Admin Notice) | [x] Completed | 2026-10-18 05:40:00 UTC | 2026-10-18 06:15:00 UTC | [PR #24](https://github.com/octalve-core/octalve-edu/pull/24) |
| 19 | Release Staging | Release v1.0.1 Staging: Promote `dev` ➔ `master` | [x] Completed | 2026-10-18 06:33:00 UTC | 2026-10-18 06:33:30 UTC | [PR #25](https://github.com/octalve-core/octalve-edu/pull/25) |
| 20 | Release Production | Release v1.0.1 Production: Promote `master` ➔ `prod` (Tagged `v1.0.1`) | [x] Completed | 2026-10-18 06:33:40 UTC | 2026-10-18 06:34:00 UTC | [PR #26](https://github.com/octalve-core/octalve-edu/pull/26) |
| 21 | [TASK-0017](0017-review-fixes-access-atomicity-and-request-bodies.md) | Review fixes: who may read and write what, writes that are all or nothing, request bodies | [x] Completed (merged into `dev`; full suite on the merged `dev`: 2159 passed, 23 skipped, 2 failed, the two failures repaired in task 0019) | before 2026-10-20 17:37:44 UTC | 2026-10-20 19:57:42 UTC | PRs [#36](https://github.com/octalve-core/octalve-edu/pull/36) to [#43](https://github.com/octalve-core/octalve-edu/pull/43) |
| 22 | [TASK-0018](0018-teacher-assignments-for-results-and-certificate-verification.md) | Teacher assignments for results; certificates: verification by token, numbers per school, access by role and campus | [x] Completed (merged into `dev`; the certificate migration is for the maintainer to run on the hosted database BEFORE the code is deployed there) | 2026-10-20 20:31:57 UTC | 2026-10-20 21:39:38 UTC | PRs [#45](https://github.com/octalve-core/octalve-edu/pull/45), [#46](https://github.com/octalve-core/octalve-edu/pull/46) |
| 23 | [TASK-0019](0019-a-request-that-cannot-be-valid-is-a-4xx.md) | A request that cannot be valid is a 4xx (NUL character, broken percent-encoding) and two tests that failed only under load | [x] Completed (merged into `dev`) | 2026-10-20 23:45:54 UTC | 2026-10-21 00:28:14 UTC | PRs #47, #48 and #49 |
| 24 | [TASK-0020](0020-results-approver-scopes.md) | Results are approved by assignment: generally, per section or per class (ADR 0018) | [ ] In progress (ADR merged as PR #51 and accepted by the maintainer on 2026-10-23; slice 1 merged as PR #54; slices 2 to 4 not started; the migration `20261030090000_results_approval_scopes` is for the maintainer to run BEFORE the code is deployed) | 2026-10-21 01:12:08 UTC | — | PRs #51 (ADR), #54 (slice 1) |
| 25 | [TASK-0021](0021-proxy-api-matcher-and-shared-body-reader.md) | The proxy must not make Next wait for an API request body; one shared reader for a request body | [ ] In progress (module A merged as PR #56; module B, the reader, merged as PR #57; module C, AlEemaan, not started) | 2026-10-21 UTC | — | `claude/shared-body-reader` |
| 26 | [TASK-0022](0022-invoice-numbers-under-concurrency.md) | Invoice numbers are unique under concurrency (ISS-0030) | [x] Completed: merged into `dev` as PR #58 (`be0ae1a`; branch `claude/fix-invoice-numbers`) | 2026-10-21 | — | `claude/fix-invoice-numbers` |
| 27 | [TASK-0023](0023-payment-status-who-may-confirm.md) | Who may confirm which payment reference (ISS-0029) | [x] Completed: merged into `dev` as PR #60 (`108849e`; branch `claude/fix-payment-status-access`) | 2026-10-22 | — | `claude/fix-payment-status-access` |
---

## Detailed Milestone Checklist

### TASK-0001: Phase 1.2 — People & Enrolment
- **Started:** `2026-10-07 09:00:00 UTC`
- **Ended:** `2026-10-09 09:06:17 UTC`
- **Status:** Completed (PR #11 open and green, awaiting maintainer merge)
- [x] Design committed in plan doc (`9a98295`)
- [x] 1.2a pure rules (`1dd1129`), school type from server env (`bba8985`, ADR 0010 accepted), schema/migration/RLS (`c00f7b8`)
- [x] 1.2b students & session enrolment (`21b58fe`)
- [x] 1.2c guardians & primary contact links (`e580487`)
- [x] 1.2d staff records, assignments, account invitation linking (`134e36a`)
- [x] 1.2e CSV import & formula-neutralised export (`1d7aefd`)
- [x] 1.2f screens, student/staff detail pages, a11y focus restoration (`96d139f`)
- [x] Option B: Audited `allowDuplicate: true` override on create, update, restore, and import without PII
- [x] Migration: `docs/decisions/` → `docs/adr/`, 11-rule template adoption, and ADR 0014 recorded
- [x] Verification: Full suite 1,603 tests green + targeted 36 tests green
- [x] Pushed to fork: Commits `9493031` and `15cdde3` live on PR #11

---

### TASK-0002: Phase 1.3 — Attendance & Day-to-Day Operations
- **Started:** `2026-10-09 15:06:00 UTC`
- **Ended:** `2026-10-09 21:07:00 UTC`
- **Status:** Completed
- [x] Sub-phase A: Design committed in plan doc (`domain-implementation-plan.md`)
- [x] Sub-phase B: Schema & migration (AttendanceRecord table, unique per student+date, RLS policies)
- [x] Sub-phase C: Pure rules & bulk idempotent mark service
- [x] Sub-phase D: API routes (GET roll-call, POST bulk mark, edit window enforcement)
- [x] Sub-phase E: UI components (fast phone grid touch interface, summary cards, absentee list)
- [x] Sub-phase F: Unit, integration, API, and e2e test suite execution
- [x] Sub-phase G: Phase documentation & PR creation

---

### TASK-0003: Phase 1.4 — Results, Grading & Publishing Workflow
- **Started:** `2026-10-09 22:36:00 UTC`
- **Ended:** `2026-10-09 23:08:00 UTC`
- **Status:** Completed
- [x] Sub-phase A: Schema & migration (`prisma/schema/results.prisma`, RLS policies, append-only `ResultAudit`)
- [x] Sub-phase B: Pure rules & computation (`rules.ts`, `ranking.ts` 1224 ties, tamper-evident SHA-256 hash)
- [x] Sub-phase C: Domain services & HTTP schemas (`service.ts`, `http.ts`, IDOR protections)
- [x] Sub-phase D: API endpoints (results query/entry, status transitions, student report card, public token verification)
- [x] Sub-phase E: UI components (`ResultsEntryGrid`, `ResultsApprovalConsole`, `ReportCardView`, `VerifyCertificateForm`)
- [x] Sub-phase F: Unit, integration (RLS & append-only grants), and API testing green
- [x] Sub-phase G: Quality gates (`pnpm typecheck`, `pnpm lint`, `pnpm format:check`) and task synchronization

---

### TASK-0004: Phase 1.5 — Finance, Invoicing & Paystack Integration
- **Started:** `2026-10-10 00:07:00 UTC`
- **Ended:** `2026-10-10 08:45:00 UTC`
- **Status:** Completed
- [x] Sub-phase A: Schema & migration (`prisma/schema/finance.prisma`, PostgreSQL RLS policies, catalog guards)
- [x] Sub-phase B: Pure rules & computation (`rules.ts`, `crypto.ts`, timingSafeEqual HMAC-SHA512 verification)
- [x] Sub-phase C: Gateway client & dual-mode simulator (`mock-paystack.ts`, `paystack.ts`, fail-safe `PAYSTACK_NOT_CONFIGURED` in production)
- [x] Sub-phase D: Domain services & atomic concurrency (`service.ts`, `http.ts`, 20 simultaneous fulfilments locked to 1 credit)
- [x] Sub-phase E: API endpoints (fee structures, invoices, payment initialization, manual payment, discounts, public webhook)
- [x] Sub-phase F: UI components (`FeeStructuresPanel`, `InvoicesDashboard`, `InvoiceDetailView` with printable receipt, `PaystackMockModal`)
- [x] Sub-phase G: Testing & quality gates (unit tests 267/267, RLS 66/66, API tests 9/9, typecheck 0 errors, eslint 0 warnings, prettier check clean)

---

### TASK-0005: Phase 1.6 — Announcements & Timetable Scheduling
- **Started:** `2026-10-10 11:15:00 UTC`
- **Ended:** `2026-10-10 15:30:00 UTC`
- **Status:** Completed
- [x] Sub-phase A: Schema & migration (`timetable.prisma`, `announcements.prisma`, PostgreSQL RLS policies)
- [x] Sub-phase B: Pure rules & clash detection engine (`rules.ts`, teacher/room/class conflict detection)
- [x] Sub-phase C: Domain services & HTTP schemas (`service.ts`, `http.ts`, audience targeting)
- [x] Sub-phase D: API endpoints (timetable CRUD + batch, announcements broadcast & feed)
- [x] Sub-phase E: UI components (`TimetableCanvas`, `SlotEditModal`, `AnnouncementsFeed`, `AnnouncementComposerModal`)
- [x] Sub-phase F: Unit, integration, and API tests (287 unit, 66 RLS, 20 API)
- [x] Sub-phase G: Quality gates (`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm tasks:check`) and PR submission

---

### TASK-0006: Phase 1.7 — Settings UI, Step-up MFA & Audit Logging
- **Started:** `2026-10-10 16:00:00 UTC`
- **Ended:** `2026-10-10 17:10:00 UTC`
- **Status:** Completed
- [x] Sub-phase A: Schema & migration (`settings.prisma`, `tenancy.prisma`, append-only `SettingsChangeAudit`, PostgreSQL RLS policies & revoked privileges)
- [x] Sub-phase B: Pure rules & delta computation (`rules.ts`, `ALLOWED_SETTING_FIELDS`, `isControlWeakened`)
- [x] Sub-phase C: Domain services & HTTP schemas (`service.ts`, `http.ts`, step-up proof verification via TOTP/recovery or password)
- [x] Sub-phase D: API endpoints (`GET/PATCH /api/v1/schools/[code]/settings`, atomic settings mutation with audit row logging)
- [x] Sub-phase E: UI components (`SchoolSettingsPanel`, `StepUpModal`, `SettingsAuditLog`, `/schools/[code]/settings` page, active shell nav)
- [x] Sub-phase F: Testing & quality gates (294 unit tests, 68 RLS tests, 15 API tests, clean build/typecheck/lint/format)
- [x] Sub-phase G: Documentation & completion record (`phases/phase-1.7-settings-and-mfa.md`)

---

### TASK-0007: Phase 1.8 — End-to-End Hardening, Security Walk & Gate
- **Started:** `2026-10-10 17:35:00 UTC`
- **Ended:** `2026-10-10 19:25:00 UTC`
- **Status:** Completed
- [x] Sub-phase A: Cross-Tenant IDOR Audit Suite (`tests/api/idor-audit.spec.ts`, 22 attack vectors passing 100% green)
- [x] Sub-phase B: Multi-Actor Lifecycle Walk (`tests/integration/phase-1-lifecycle-walk.spec.ts`, 11/11 tests across 10 lifecycle steps passing 100% green)
- [x] Sub-phase C: Payment & Webhook Adversarial Security Suite (`tests/api/finance-adversarial.spec.ts`, 5/5 tests covering forged HMAC, replays, tampered amounts, and concurrency locks passing 100% green)
- [x] Sub-phase D: Query Performance & Index Sanity (`tests/integration/query-performance.spec.ts`, 6/6 tests asserting PostgreSQL `EXPLAIN` Index Scan utilization passing 100% green)
- [x] Sub-phase E: Documentation, Phase Record & Final Phase 1 PR (`phases/phase-1.8-phase-gate.md`, all quality gates certified green)




### TASK-0008: Post-Phase-1 verification and defect fixes
- **Status:** Completed — landed in octalve-core `dev` (PR #6); full suite 1757 passed / 0 failed / 23 skipped
- [x] Static gate clean
- [x] Full suite run (result in the task file); [x] the 6 stale e2e tests fixed
- [x] Defects from code review fixed test-first (finance receipts and webhook, results transitions)
- [x] Stack landed in octalve-core `dev` (one PR from the fork's stack branch); `dev` → `master` (staging) still needs the maintainer's approval

### TASK-0009: Campus administrators and the platform superadmin
- **Status:** Completed — landed in octalve-core `dev` (PR #7); full suite 1842 passed / 3 failed (shell e2e flakes) / 23 skipped
- [x] Slice A: migrations (`CAMPUS_ADMIN`, CHECK, `isPlatformAdmin`, `suspendedAt`, `PlatformAuditLog`, `platform_*` functions), `canAdminister`, tests
- [x] Slices B1–B4: campus-capable routes (people, academics of a campus, attendance, announcements, timetable, finance, members/invitations)
- [x] Slice C: suspension in the resolver, `make-platform-admin` script, platform API and page
- [x] Slice D: route-role guard test, ADR 0016 (Accepted), docs, full suite, PR

### TASK-0010: Platform follow-ups: counters, first-admin re-invite, attendance scoping, verification
- **Status:** Completed — F1-F4 landed in octalve-core `dev` as PR #8 (full suite 1927 passed); F5 merged
- [x] F1: platform counters via `TenantStats` delta triggers and recount functions
- [x] F2: re-invite the first administrator via platform action and operator script (`scripts/invite-first-admin.mjs`)
- [x] F3: teachers' attendance scoping at campus level and arm level (`lib/attendance/access.ts`)
- [x] F4: public verification privacy: full name displayed, admission number excluded, `noindex, nofollow` headers
- [x] F5: academic setup editing controls for campus administrators

### TASK-0011: Audited support access (ADR 0017)
- **Status:** Completed — slices A-E landed in octalve-core `dev` as PR #14; named grantee & admin email notification follow-ups landed in PR #24
- [x] Slice A: support grants on the school side (`SupportGrant`, RLS policies, time limits)
- [x] Slice B: support session on the platform side (`supportTenantId`, `platform_support_record`, read-only enforcement)
- [x] Slice C: declared areas across 31 school GET routes + source-level area guard
- [x] Slice D: UI panels (school support page, platform open-view dialog, persistent shell read-only banner)
- [x] Slice E: full suite verification and production deploy checklist
- [x] Follow-ups: Named Grantee support (`granteeUserId` / `granteeEmail`) and school administrator email notification on support session open (`PR #24`)

### TASK-0012: Phase 2 — Communication & Multi-Channel Messaging Engine
- **Status:** [x] Completed (Slices A-H landed and verified 100% green)
- [x] Sub-phase A: Schema & migrations (`NotificationTemplate`, `NotificationDispatch`, `GuardianLinkToken`, RLS)
- [x] Sub-phase B: BullMQ queue infrastructure with Redis backing (`src/lib/queue/`)
- [x] Sub-phase C: Template engine with variable interpolation & standard system templates
- [x] Sub-phase D: Multi-channel delivery adapters (Email via Resend, SMS & WhatsApp via Termii, In-App)
- [x] Sub-phase E: Guardian-link messaging with cryptographic magic links
- [x] Sub-phase F: Automated event hooks (absence notifications, results publishing alert, fee reminders)
- [x] Sub-phase G: UI panels (Template Manager, Broadcast Composer, Dispatch Log, Shell nav)
- [x] Sub-phase H: Testing & quality gates (Unit, Integration, API, E2E, Axe accessibility)

---

### TASK-0013: Phase 3 — Global Quick-Tools Dock & Progressive Web App (PWA)
- **Status:** [x] Completed (PR #19 open and green, awaiting review)
- [x] Sub-phase A: PWA Infrastructure, Manifest & Service Worker (`manifest.ts`, `sw.js`, offline fallback `/offline`, dynamic icons, shortcuts, appleWebApp capabilities)
- [x] Sub-phase B: Floating Tools Trigger & Shell Integration (`QuickToolsTrigger`, `QuickToolsDrawer`, `Cmd+K` & `Alt+T` listener)
- [x] Sub-phase C: Universal School Calculator (`CalculatorTool`, pure Shunting-Yard math engine, discount presets, history tape)
- [x] Sub-phase D: Quick Payment Recorder & Offline Queue (`PaymentRecorderTool`, IndexedDB offline queue, balance lookup, receipt print, auto-sync)
- [x] Sub-phase E: Quick Actions Suite (`PaymentLinkTool` Paystack QR/link generator, `QuickBroadcastTool` emergency alerts, `QuickNotesTool` persistent scratchpad)
- [x] Sub-phase F: Verification, A11y & Quality Gates (Unit tests 12/12, E2E tests 3/3, Axe WCAG 2.2 clean, typecheck & lint 0 errors)

---

### TASK-0014: Phase 4 — Learning Management System (LMS) & Assignments
- **Status:** [x] Completed (`claude/phase-4-lms-assignments`)
- [x] Sub-phase A: Data Architecture & Schema (`prisma/schema/lms.prisma`)
- [x] Sub-phase B: Database Migrations & Multi-Tenant RLS Policies
- [x] Sub-phase C: Pure Domain Rules & Validation (`src/lib/lms/`)
- [x] Sub-phase D: API Endpoints (`/api/v1/schools/[code]/lms/`)
- [x] Sub-phase E: UI Consoles & Shell Integration (`LmsPanel.tsx`, dedicated page & Academics tab)
- [x] Sub-phase F: Testing & Quality Gates (Unit 13/13, API 11/11, E2E A11y 3/3, Typecheck & Lint 0 errors)

---

### TASK-0015: Phase 5 — Higher-Ed Credit Unit System, Custom Domains & Vocational Certifications
- **Status:** [x] Completed (`claude/phase-5-expansion`)
- [x] Architectural Guard Fixes & Baseline Green (365/365 unit tests passing)
- [x] Sub-phase A: Data Architecture & Prisma Schema (`tenancy.prisma`, `higher_ed.prisma`)
- [x] Sub-phase B: Database Migrations & Multi-Tenant RLS Policies (`20261027090000_phase_5_expansion/migration.sql`)
- [x] Sub-phase C: Pure Domain Rules & Engines (`src/lib/higher-ed/`, `src/lib/domains/`, `src/lib/certificates/`)
- [x] Sub-phase D: Domain Services (`service.ts` for higher-ed, domains, certificates)
- [x] Sub-phase E: API Endpoints (`/higher-ed/`, `/domains/`, `/certificates/`)
- [x] Sub-phase F: UI Consoles & Shell Integration (`HigherEdPanel`, `CustomDomainSettings`, `CertificatesConsole`)
- [x] Sub-phase G: Testing, Quality Gates & Sync (378/378 unit tests passing, typecheck & prettier clean)

---

### Release v1.0.1: Audited Support Access Enhancements & Test Hardening
- **Status:** [x] Completed (PR #24 on `dev`, promoted to `master` via [PR #25](https://github.com/octalve-core/octalve-edu/pull/25) and `prod` via [PR #26](https://github.com/octalve-core/octalve-edu/pull/26), tagged `v1.0.1`)
- [x] Named Grantee Support in Support Access (`granteeUserId` and `granteeEmail` recorded on active sessions).
- [x] Admin Email Notification dispatched quietly (`supportOpenedNotice`) upon support session opening.
- [x] Test Setup Privileges Hardening: explicitly revoked `UPDATE`, `DELETE`, and `TRUNCATE` on `SettingsChangeAudit` and `NotificationAuditLog` from `app_user`.
- [x] Calendar-invariant dynamic date assertions in integration lifecycle tests.
- [x] RLS table catalog guard updated with 11 Phase 4 & Phase 5 tables.





### UI fixes found by the AlEemaan browser run, applied here (branch `claude/ui-fixes-hydration-nav`)
- **Status:** [x] Committed locally, PR into `dev` pending.
- [x] React hydration error #418 on signed-in full loads: `ServiceWorkerRegister` read `navigator.onLine` while rendering; it now starts online and reads it in an effect.
- [x] Finance, Higher-ed, Certificates and Custom-domain screens used design tokens this app does not define (`text-foreground`, `bg-primary`, `border-border`...), so they rendered largely unstyled; mapped to the real tokens (`text-fg`, `bg-brand-strong`, `border-line`...).
- [x] Lint was failing on `dev` with 3 errors: the support-grants route read the platform administrator with the raw client (now `findPlatformAdminByEmail` in `lib/support/grants.ts`), and an unescaped apostrophe.
- [x] Stale tests repaired: academics sections list (the LMS section exists), people-students (the `gender` field).
- [ ] Known failing on `dev` itself (verified by stashing): `shell.spec.ts` "More: who you are..." on a phone (the Users tab is not found while the More sheet is open) and `academics.spec.ts` "staff may LOOK" (an `Open` button is present). Not caused by this branch; not fixed.
- Correction: the Coursework page IS reachable (Academics > "LMS & Assignments"); an earlier note saying it was unreachable was wrong, so no menu item was added.
- Full suite on this branch: 2069 passed, 13 failed, of which 4 were nav-test failures from a menu item that was then removed, 4 sign-out/cookie tests that passed again when run alone (load), 2 stale tests fixed above and 3 pre-existing (above).

---

### TASK-0017: Review fixes - who may read and write what, writes that are all or nothing, request bodies
- **Started:** before `2026-10-20 17:37:44 UTC` (the first commit of the series; the start was not timestamped)
- **Ended:** `2026-10-20 19:57:42 UTC` (PR #43 merged)
- **Status:** [x] Completed: merged into `dev` as PRs #36 to #43 on 2026-10-20, in order, each after its Vercel check passed and with `base.ref` checked to be `dev` (merge commits `b13d725`, `6eb6fd4`, `25ae546`, `3206971`, `abe0d57`, `fb76827`, `87a4cb9`, `d12d22d`). Detail, rules and numbers: [the task file](0017-review-fixes-access-atomicity-and-request-bodies.md).
- [x] #36 `claude/fix-bounded-body-read`: `validate()` reads a request body no further than the cap
- [x] #37 `claude/fix-timetable-write-checks` (two commits): a refused batch changes nothing; one lesson's start and end are checked together
- [x] #38 `claude/fix-lms-whose-work`: work is handed in for the signed-in student's own record, reads follow the viewer, marked work is final for the student
- [x] #39 `claude/fix-results-draft-only`: a result is edited only while DRAFT, a refused request writes nothing, recording and listing follow the caller's campus
- [x] #40 `claude/fix-attendance-roll`: a roll names only the students on that arm's roll
- [x] #41 `claude/fix-report-card-scope`: staff read a report card within their campus and, for a teacher, their own arms
- [x] #42 `claude/chore-source-hygiene`: no invisible or direction-changing character typed into a source file, with a guard test
- [x] #43 `claude/fix-names-need-a-visible-character` (on top of #42): a name needs a visible character
- [x] Verification: typecheck, lint and prettier clean on each branch and on the merge of the six fixes; unit 382 on `dev` before, 385 on the merge of the six, 389 on the merged `dev`; API 705, integration 614, e2e (3 specs) 15 on one build of the first five; the last two changes 148 + 40 API tests; every new test failed on the unfixed build first
- [x] One full suite on the merged `dev` (PRs #36 to #44, all projects, 2.1 hours): 2159 passed, 23 skipped, 2 failed; the two failures (the email-change timing check and the account-menu e2e test) are repaired in task 0019. A first attempt, built from the eight branches, had ended before any test ran: the web servers did not start within 60 s at a load average of 48, which is not a test failure.
- [ ] NOT run: the API and integration projects on each branch alone.
- [ ] After the promotion to `prod`: record the issues these fixed in `docs/issues/README.md` (the maintainer decides the wording while the repository is public)

### TASK-0018: Teacher assignments for results, and certificates (verification by token, numbers per school, access by role and campus)
- **Started:** `2026-10-20 20:31:57 UTC` (the first commit of the series)
- **Ended:** `2026-10-20 21:39:38 UTC` (PR #46 merged)
- **Status:** [x] Completed: merged into `dev` as PRs #45 and #46 on 2026-10-20, each after its Vercel check passed and with `base.ref` checked to be `dev` (merge commits `443a565`, `a17baa3`). **#46 ships a migration that the maintainer runs on the hosted database before the code is deployed there.** Detail, rules and numbers: [the task file](0018-teacher-assignments-for-results-and-certificate-verification.md).
- [x] #45 `claude/fix-results-assigned-subject-arm` (two commits): a teacher records a subject only for the students of an arm they are assigned it in (403 otherwise, nothing saved); a teacher's results list is the students of the arms they are assigned to (an approver keeps the campus-ruled list)
- [x] #46 `claude/fix-certificates-verify-and-access` (two commits, a migration): the public verification takes a 32-character token instead of the number; numbers are unique within a school and taken under a lock; issuing refuses an unknown student or period before writing; a student lists their own certificates, a campus member their campus's and the school-wide ones', a campus administrator issues and revokes for their own campus's students only
- [x] Verification: every new test failed on an unfixed build first (35 of 139 API and integration tests, 4 of 22 unit tests, every one for the intended reason); results 125 passed and certificates 93 passed on the branches' builds; unit 389 and 390; the migration was rehearsed over existing rows and the build before it was run against the migrated database; the unit project on `dev` after #45 to #49 (tip `cf32c30`): 396 passed.
- [ ] The maintainer runs `pnpm db:migrate:deploy` on the hosted database before the certificate code is deployed there
- [ ] NOT run: mobile e2e, https project, the e2e specs, a full suite with both branches merged, the migration on the hosted database
- [ ] After the promotion to `prod`: record what these fixed in `docs/issues/README.md` (the maintainer decides the wording while the repository is public)

### TASK-0019: A request that cannot be valid is a 4xx (NUL character, broken percent-encoding) and two tests that failed only under load
- **Started:** `2026-10-20 23:45:54 UTC` (the first commit of the three branches)
- **Ended:** `2026-10-21 00:28:14 UTC` (the last pull request merged)
- **Status:** [x] Completed: merged into `dev` as PRs #47, #48 and #49, each after its Vercel check passed and with `base.ref` checked to be `dev`. Detail, rules and numbers: [the task file](0019-a-request-that-cannot-be-valid-is-a-4xx.md).
- [x] #47 `claude/fix-malformed-path-is-400`: a path with broken percent-encoding (`%ff`, a lone `%`, `%ED%A0%80`) is a 400 from the proxy, pages and API (it was a bare 500 before any route ran); the proxy's matcher now covers `/api/:path*`
- [x] #49 `claude/fix-nul-in-input`: a NUL character in a path segment (404), the query string (400) or a JSON body (400) is refused before the handler by `withAuth` and `validate()` (it was a 500 on 15 route-and-method pairs for a path segment, on lists and searches for the query string, and on five create routes for the body); the same branch makes four route-and-method pairs that answered 500 for an id this school does not have answer 404 (LMS assignments and materials) or 400 (the payment status)
- [x] #48 `claude/fix-two-load-sensitive-tests` (two commits): the email-change timing check (lower quartile of 12 samples, 250 ms, its own 240 s budget; a 400 ms wait in the route is refused, a 60 ms one is not reliably seen) and the account-menu e2e test (waits for the page the person ends up on; sign-in 15 s)
- [x] Verification: every new test failed on an unfixed build first (NUL: 15 of 21 API tests, the rest controls; proxy: 8 of 10); on the branches' builds NUL 67 passed in the four spec files (the first version), then 168 passed in the 14 neighbouring spec files after the unknown-id fixes and 1791 of 1794 in the whole unit, integration and api projects on the first version's build; the unit project on `dev` after #49: 396 passed, proxy 52 passed, the whole shell spec 55 passed in 3 repetitions at load 20 to 27
- [x] The NUL scan of the query string and the JSON body is ported to AlEemaan (roji-tech/AlEemaan PR #79, merge commit `deb072f`, 2026-10-21 01:41 UTC; it already had the path rule and the malformed-path rule)
- [ ] The 16 routes that read their own body are not behind the body scan: one shared reader with the scan is the next batch
- [ ] NOT run: the e2e and https projects on the NUL and proxy branches, a full suite with all three merged
- [ ] After the promotion to `prod`: record what these fixed in `docs/issues/README.md` (the maintainer decides the wording while the repository is public)

### TASK-0020: Results are approved by assignment: generally, per section or per class (ADR 0018)
- **Started:** `2026-10-21 01:12:08 UTC` (the first commit of the ADR)
- **Status:** [ ] In progress. [ADR 0018](../adr/0018-results-are-approved-by-assignment-generally-per-section-or-per-class.md) is merged as PR #51 (merge commit `b6729c8`, 2026-10-21 01:15:31 UTC) and was accepted by the maintainer on 2026-10-23 ("yes to all three" details; only a person accepts an ADR). Detail, slices and numbers: [the task file](0020-results-approver-scopes.md).
- [x] The maintainer's decision (2026-10-21): approvers are assigned General (their whole campus), per section (primary, JSS, SSS) or per class (JSS 2 ...) in the school's settings, and see and act on only what is assigned to them; Octalve first, AlEemaan after.
- [x] #51 `claude/results-approver-scopes`: the ADR.
- [x] Slice 1 MERGED as PR #54 (`4dd25a1`, 2026-10-21 08:12 UTC; branch `claude/results-approver-scope-rules`): `Section`, `ResultApprovalScope`, migration `20261030090000_results_approval_scopes` (backfills a General scope for every current holder of `CAN_APPROVE_RESULTS`), `src/lib/results/approver-scope.ts`, the transitions and the list follow the scope, members get a General scope with the permission; failing-first by mutation 12 of 21 fail, 9 controls pass; the whole setup, unit, integration and api run 1832 passed, 3 failed of 1835 (two pass alone, one is a failure on `dev` since #47: the proxy makes Next wait for the end of an API request body)
- [x] Slice 2a: the school setting `unsectionedClassApproval` (decided 2026-10-23) with its migration `20261031090000_unsectioned_class_approval`, the rule that reads it and the settings route that carries it; failing first by mutation, 194 specs pass
- [x] Slice 2b: sections and approvers API (five routes under `/settings`; `ADMIN` only, audited, fresh re-authentication); failing first by mutation (2 of 13 fail, 11 controls pass); 201 specs pass on the branch
- [x] Slice 3: the settings screen: a Results approval tab (sections, which class is in which, where each approver approves; every write through the step-up dialog) and the `unsectionedClassApproval` select in Configuration; failing first by mutation (the campus rules removed: 5 of 20 new tests fail, 15 controls pass); unit 7 and e2e 12 (desktop and phone, both themes, axe) pass
- [ ] Slice 4: AlEemaan
- [x] The maintainer: yes to the three details; the ADR is accepted (2026-10-23)
- [ ] The maintainer: run the migration on the hosted database before the code is deployed there

### TASK-0021: The proxy must not make Next wait for an API request body; one shared reader for a request body
- **Status:** [ ] In progress. [The task file](0021-proxy-api-matcher-and-shared-body-reader.md) has the cause, the plan and what is left.
- [x] Module A, the proxy fix: merged as PR #56 (`ae724c9`, 2026-10-21 19:54 UTC)
- [x] Module B, the shared reader: written, failing first (14 of 52 failed on the old routes), verified (whole setup, unit, integration and api projects: 1929 passed, 0 failed); merged as PR #57 (`cfef611`, 2026-10-21 22:14 UTC)
- [x] Follow-up: every 413 closes the connection after it (`Connection: close`); the reset of the next request on a reused connection (found in AlEemaan) cannot happen; failing first on a build without it (both new tests failed), 140 specs pass; merged as PR #59 (`1c38f68`)
- [ ] Module C, AlEemaan: its matcher is fixed in its task 0036; port the reader (its routes answer 500 for a body that is not JSON)

### TASK-0022: Invoice numbers are unique under concurrency (ISS-0030)
- **Status:** [x] Completed: merged into `dev` as PR #58 (`be0ae1a`), branch `claude/fix-invoice-numbers`. [The task file](0022-invoice-numbers-under-concurrency.md) has the plan and what is left.
- [x] A bill run takes the school's invoice-number lock first and takes the next free number; `tests/integration/invoice-numbers.spec.ts` (3 tests)
- [x] Failing first on the unfixed service (3 of 3 failed); on the branch the 3 tests, the lifecycle walk and the finance API specs (38) pass; build, tsc, eslint, prettier and the catalogs clean
- [ ] Not run: the whole setup, unit, integration and api projects; e2e and https; a full suite on the merged `dev`

### TASK-0023: Who may confirm which payment reference (ISS-0029)
- **Status:** [x] Completed: merged into `dev` as PR #60 (`108849e`), branch `claude/fix-payment-status-access`. [The task file](0023-payment-status-who-may-confirm.md) has the plan and what is left.
- [x] `confirmPaymentForRequester`: only a member who may see the payment's invoice can confirm it; unknown, another school's and not theirs are the one refusal; the gateway is not asked for them; the route uses it
- [x] Failing first on a build of `dev` (the foreign-member test and the other-school test failed; the own-guardian and pending controls passed)
- [x] Verified on the branch (payment-status, finance, campus-admin-finance and idor-audit specs: 42 passed); PR #60 merged. Not run: the other projects on the branch; the full suite on the merged `dev` is in progress

## TASK-0024: the question bank (parity with AlEemaan's task 0032)

[Task file](0024-question-bank.md). Slice A (schema, migration, pure parts, database tests) is merged (PR #68). Slice B (reviewers and switches) is merged (PR #69). Slice C (the questions and their review: service and API) is merged (PR #70). Slice D (pictures) is merged (PR #71). Slice E (the screens: Browse, My questions, Review queue, a navigation entry for staff) is merged (PR #72). All five slices are on `dev` (2026-10-26); what remains is the walkthrough, the hosted migration and image store, and the slice that reads `bank.parents.view`.

## TASK-0025: the Forms and question-bank screens (parity with AlEemaan's task 0041)

[Task file](0025-forms-screens.md). The APIs of the Forms module and the question bank's reports, printing and offer-back were on `dev`; the screens were not. **All eight slices (O1 to O8) are built and tested (2026-11-03, lane 3; results in section 5 of the task file) and merged into `dev` as PR #86 (`8115519`).** The maintainer asked on 2026-11-02 for all the implementation first, then each slice tested in turn.

- [x] O6 reports, print, print log and offer-back from an LMS quiz card: built and tested
- [x] O7 a Video guide link in the profile menu, a configurable address for the video and its policy, `NEXT_DIST_DIR`: built and tested
- [x] O1 staff forms and O2 form page / marking / roll call: built and tested (four routes added: questionnaire detail and update, questionnaire close, paper-work close, practice-set responses)
- [x] O3 the pupil's forms (My work), O4 the pupil's practice and a guardian's page (My children), O5 the public questionnaire page: built and tested (service changes and one new route on the way, see the task file)
- [x] O8 the five things the screens showed were missing (staff reporter's outcomes, one answer per practice set, carrying on a practice session, one answer per browser on a public link, "For you" for staff and guardians): built and tested
- [x] PR #86 into `dev`, guarded merge (2026-11-03)
- [ ] Octalve's walkthrough (its own run, after AlEemaan's)

## TASK-0026: the sidebar in sections, collapsible to icons, with the person pinned at the foot (parity with AlEemaan's task 0042)

[Task file](0026-sidebar-sections.md). Requested by the maintainer on 2026-11-03 for both repos. Built and tested 2026-11-03 (section 7 of the task file) and merged into `dev` as PR #88 (`e5549fc`).

- [x] Sections that fold (Administration, Learning; Platform as a plain link last), remembered in a cookie; the section of the current page opens on arrival
- [x] The whole sidebar folds to a rail of icons with a round arrow on its edge; it opens over the page while an icon is hovered or focused (hovering the arrow does nothing); the school switcher keeps its height in the rail
- [x] The person stays pinned at the foot; the phone More sheet has the same headings
- [x] Unit and e2e tests (both themes, open, rail and peek); component and function catalogs
- [ ] Octalve's walkthrough must include the shell rows (its own run, after AlEemaan's)

## TASK-0027: Programs, learning that is not a normal class (parity with AlEemaan's task 0043)

[Task file](0027-programs.md). Requested by the maintainer on 2026-11-03 for AlEemaan; the Octalve port was designed 2026-11-04 and built 2026-11-09 on `claude/octalve-programs` (P1 on `claude/octalve-screens`). Needs the migrations `20261116090000_programs_structure`, `20261117090000_standing_participant_subject`, `20261117100000_program_people`, `20261118090000_program_attendance`, `20261119090000_program_assessments`, `20261120090000_program_fees`, `20261121090000_program_completion`, in that order, on the hosted databases (the maintainer runs them).

- [x] P0 The generic tenant-and-campus settings table (`TenantSetting`, shared with 0028 and 0029)
- [x] P1 Structure - [x] P2 People - [x] P3 Staff and attendance - [x] P3b Assessments - [x] P4 Fees (manual payments only: the gateway `pay` route and its webhook are NOT ported) - [x] P5 Completion and certificates (with the public check through `/api/v1/verify-certificate/[token]`)
- [x] Tests: unit, API, integration (RLS and the append-only tables), the route-area and route-role guards, browser (desktop and phone, both themes, Axe). Results in the task file, section 8
- [ ] Settle the overlap with Phase 5 (vocational cohorts, higher-ed credit units)
- [ ] Walkthrough rows (not run)

## TASK-0028: Standing, suspension, expulsion and termination on the school's own records (parity with AlEemaan's task 0045)

[Task file](0028-standing.md). Requested by the maintainer on 2026-11-03 for AlEemaan; designed 2026-11-04, built 2026-11-08 (S1 to S3 API, merged as PR #92) and 2026-11-09 (the screens, the refusal of an expelled pupil at sign-in and the Settings switch, on `claude/octalve-screens`). Needs the migrations `20261115090000_standing` and, for programs, `20261117090000_standing_participant_subject`.

- [x] S1 Pupils - [x] S2 Staff and the sign-in lift - [x] S3 The campus switch (API and the Settings panel) - [x] Standing screens (a pupil's and a member of staff's page) - [x] An expelled pupil is refused at sign-in with the generic wrong-password sentence (the maintainer's decision)
- [x] Tests: unit, API, integration, browser (`finance-standing-screens`)
- [ ] A notice to the guardian of a suspended child (optional, not built)

## TASK-0029: Part payment "if allowed" (parity with AlEemaan's task 0046)

[Task file](0029-part-payment.md). Requested by the maintainer on 2026-11-03 for AlEemaan; designed 2026-11-04, F1 built 2026-11-08 (PR #92), F2 built 2026-11-09 on `claude/octalve-screens`. Only an `ADMIN` sets the rule (ADR 0016: a campus administrator does not configure fees). Needs the migration `20261114090000_tenant_settings_part_payment`.

- [x] F1 Column, rule, settings, enforcement in both payment paths, with the row lock that closed a double-take race the payment paths had
- [x] F2 The Finance page (`/schools/[code]/finance`: Invoices, Fee structure, the payment rules, the record-payment dialog, the invoice detail)
- [ ] The invoice screens for a pupil or a guardian (not built)

## TASK-0030: Progress records (logbooks), the port of AlEemaan's task 0044

[Task file](0030-progress-records.md). Requested by the maintainer on 2026-11-03 for AlEemaan; built 2026-11-09 on `claude/octalve-programs` (slices R1 to R4). Needs the migration `20261122090000_progress_records`.

- [x] R1 Templates (the Quran memorisation booklet and a plain daily log), records, entries by day - [x] R2 Versions, verification with four eyes, the lock on an entry, the week grid and "verify the week" - [x] R3 The pupil's and the guardian's view (verified copy only, "seen" as a record of a week), the three switches - [x] R4 Arabic and English, Gregorian and Hijri, the digits, the print sheet
- [ ] R5 Translation while typing: **blocked, the maintainer must choose a provider and give credentials**
- [ ] The Arabic wording needs an Arabic reader


## TASK-0031: Promotion and the Results screens (the port of AlEemaan's tasks 0025, 0037 and the results screens)

[Task file](0031-promotion-and-result-sheets.md). Requested by the maintainer on 2026-11-09 ("start", then "implement all in one go then test one by one"); designed and built 2026-11-09 on `claude/octalve-promotion`. Needs the migration `20261123090000_promotion`.

- [x] Promotion: two append-only tables, the pure rules, the service (every refusal before the first write, a roll under a row lock, a pupil already placed is left alone), four routes, the Promotion section of Academic setup (preview, overrides with reasons, confirmation, history)
- [x] Results: the options, sheet and roster reads, and the page `/schools/[code]/results` (Marks, Review, Report cards), with a "Results" entry in the sidebar
- [x] The report card shows the pupil's class and rank of the period's own session (it used to show the current class, which a promotion changes)
- [x] Tests: unit, API (failing first for the report-card fix), integration (RLS), browser on desktop and phone in both themes
- [ ] Open, the maintainer's: the migration; whether a campus administrator reaches Results (D7); the final-term check as a refusal (D8); streams; report remarks, the payment gate and PDF export; a bulk import; see the task file section 8

## TASK-0032: A saved result is tied to the class's assessment scheme (the exam is one of its parts, and the first use locks the scheme)

[Task file](0032-result-scheme-tie.md). Asked for by the maintainer on 2026-11-09 ("let's go with your recommendation", after the list of what task 0031 left unbuilt); built 2026-11-09 on `claude/octalve-result-scheme`. **No migration.**

- [x] The save accepts only the scheme's parts (its components, then the exam) with the scheme's maxima and total; a refusal is a sentence that says what the scheme has; with no scheme in force the request stands as it was
- [x] The first save under a scheme locks it (once, one audit row `ASSESSMENT_SCHEME_LOCKED`); the save takes the shared form of the scheme editor's lock; a change after that is a new version
- [x] **A bug of task 0031 fixed:** the Marks sheet offered only the components, so a real scheme's exam mark could not be entered; the sheet answers `examMax` and `parts` and the screen enters them; the 0031 fixtures are schemes the app can make
- [x] Tests: unit (17), API (12 new, failing first on unmodified `dev`: 9 fail there), the sheet spec and the Marks screen spec (the exam column is missing on `dev`), the full suite
- [ ] Open, the maintainer's: whether the grade scale is locked by the first result too (it is not); whether a bare score stays refused for a scheme with parts; see the task file section 7

## TASK-0033: The logo on the signed-out screens goes back to the start page

[Task file](0033-logo-home-link.md). Asked for by the maintainer on 2026-11-10 ("make the logos go back to landing page", with a screenshot of the brand panel); built on `claude/octalve-logo-home-link`. The same change is made in AlEemaan (its task 0047).

- [x] `AuthShell`: the logo in the brand panel and in the phone header is a link to `/`; the panel is `role="none"` with its decorative parts `aria-hidden` (a link cannot sit inside an `aria-hidden` region)
- [x] A browser spec on desktop and phone: one visible logo link to `/`, reachable by keyboard with a visible focus ring, the way back from another screen, the decorative parts still hidden from assistive technology, Axe in both themes
- [x] The open point (the logo reloaded the sign-in page, because `/` was a router): closed by task 0041, which gives `/` a real landing page; the logo now leads there

## TASK-0034: The light-theme contrast scans stop failing at random (test-only)

[Task file](0034-theme-fade-contrast-flake.md). Found by the full-suite runs of tasks 0031 to 0033 (a handful of light-theme `color-contrast` failures, a different set each run, each passing alone); built 2026-11-10 on `fix/theme-fade-contrast-flake`. **Tests only; no application code, no migration.** AlEemaan already had the fix (its `page` fixture asks for reduced motion) and is not touched.

- [x] Cause: the colours fade for 150 ms after a theme flip and the specs scanned inside the fade; the specs flipped the theme by hand and waited for `networkidle`, which says nothing about a CSS transition
- [x] `tests/support/theme.ts` (`setTheme` flips and waits for every running CSS transition; `currentTheme`); fourteen browser specs use it
- [x] `unit/theme-flip-guard` fails a spec that assigns `dataset.theme` itself; a proof test in `theme.spec.ts` shows a hand-made flip leaves transitions running and `setTheme` returns only when none is left
- [x] Failing first: the same 227 tests with `setTheme` reduced to the old no-wait flip: 21 fail (19 are light-theme `color-contrast`, 2 are the proof test)

## TASK-0035: Streams: a pupil goes to the stream the school chooses when a class is rolled

[Task file](0035-streams.md). The first of the items task 0031 left unbuilt ("streams, report remarks, a payment gate, PDF report cards, bulk mark import, undoing a promotion"), asked for by the maintainer on 2026-11-10; built on `claude/octalve-streams`. **Needs the migration `20261124090000_streams` on the hosted databases (after `20261123090000_promotion`).**

- [x] A class can say which stream it is (`ClassGroup.streamName`, 1 to 40 characters or none); a school with none sees no change
- [x] A pupil stays in their stream when the class is rolled; when the stream cannot be worked out the roll asks (a placement per pupil) and refuses to guess
- [x] The roll records the class each pupil was placed in; a placement may only go to a live class of the next rung
- [x] Screens: the class dialog, the classes list, and the roll screen (a "Goes to" choice per pupil, "place every pupil", the roll held until each has a class)
- [x] Tests: unit 13, API 16, screens 4 (x2 projects); the whole unit and API projects 2,614 passed; four mutants caught


## TASK-0036: Report remarks: the teacher's and the principal's words on a pupil's report card

[Task file](0036-report-remarks.md). The second of the items task 0031 left unbuilt, asked for by the maintainer on 2026-11-10; built on `claude/octalve-report-remarks`. **Needs the migration `20261125090000_report_remarks` on the hosted databases (after `20261124090000_streams`).**

- [x] A teacher's and a principal's remark per pupil and term (500 characters; who wrote each is recorded); the principal's is the administrator's alone, the teacher's the administrator's or the teacher's of the pupil's arm; editable until any result of the term is published
- [x] Shown on the card (screen and print); a pupil or parent sees them once the term's results are published, when they are final
- [x] The editor in the Cards panel, a field only for each remark the person may write
- [x] **A bug of task 0031 fixed:** the card of a pupil or parent went empty when the term's results were locked
- [x] Tests: unit, API and screens (x2 projects), new; ten mutants caught

## TASK-0037: The payment gate on report cards

[Task file](0037-report-card-payment-gate.md). The third of the items task 0031 left unbuilt, asked for by the maintainer on 2026-11-10; built on `claude/octalve-report-card-gate`. **No migration.**

- [x] A school can hold a pupil's report card back from the pupil and their parents while school fees that are due are owed (off until the school turns it on; staff are never held)
- [x] Settings: Report cards (the school's administrator, with a fresh proof; a campus can hold for itself and never release what the school holds), audited
- [x] The refusal says what is owed and what to do; staff are told on the card what holds it
- [x] Tests: unit, API and screens (x2 projects) new; eleven mutants caught; whole unit and API projects run

## TASK-0038: PDF report cards, and a real page to check a mark

[Task file](0038-report-card-pdf.md). The fourth of the items task 0031 left unbuilt, asked for by the maintainer on 2026-11-10; built on `claude/octalve-report-card-pdf`. **No migration.**

- [x] A report card as a PDF, one pupil's or a whole class's in one file (at most 100 cards), by the same rules as the card on the screen (the payment gate, which results a pupil sees, the remarks); every download audited
- [x] A hand-written PDF writer (real text measuring, a table that continues across pages, clickable links); Latin-1 and Windows-1252 only, other characters counted in a header
- [x] "Download PDF" on a card and "Download all cards (PDF)" on the class list in the Cards panel
- [x] **A defect found by the maintainer and fixed:** the card told people to check a mark at `/api/v1/verify/<code>` (raw JSON). There is now a public page, `/verify/[code]` and `/verify`, and the card and the PDF print full, clickable links; the never-mounted `VerifyCertificateForm` is removed
- [x] Tests: unit, API and screens (x2 projects) new; twenty-eight mutant failures across eight mutations; whole unit and API projects run

## TASK-0039: Bulk mark import

[Task file](0039-mark-import.md). The fifth of the items task 0031 left unbuilt, asked for by the maintainer on 2026-11-10; built on `claude/octalve-mark-import`. **No migration.**

- [x] The Marks sheet as a CSV file to fill in (one column per part of the class's scheme, saved marks in place), and an import of that file for one subject in one class and term
- [x] A check that writes nothing, then an all-or-nothing import through `recordStudentResults` (the scheme's rules, DRAFT-only, a teacher's assignment, the scheme lock) in the same transaction; pupils found by admission number among the pupils on THIS roll only; audited without the marks
- [x] "Import marks from a file" under the grid: download, choose, check row by row, import; typed-but-unsaved marks block it
- [x] Tests: unit, API and screens (x2 projects) new; ten mutations caught; whole unit and API projects run

## TASK-0040: Undoing a promotion

[Task file](0040-undo-promotion.md). The sixth of the items task 0031 left unbuilt, asked for by the maintainer on 2026-11-10; built on `claude/octalve-undo-promotion`. **Needs the migration `20261126090000_promotion_undo` on the hosted databases (after `20261125090000_report_remarks`; additive: one enum value and one append-only table), run by the maintainer.**

- [x] A roll that was a mistake is taken back, whole, as a NEW recorded fact (`PromotionReversal`, append-only, one per roll); the roll and its records are never edited. Every pupil's place in the source session is ACTIVE again, and the new place a promotion or a repeat made becomes CANCELLED (a new enrolment status)
- [x] Whole roll or nothing: a pupil whose place was changed or used since (marks, a report remark, an invoice, attendance in the target session; a place moved on or changed by hand) stops it, by name, and nothing moves
- [x] The school's administrator only, with a fresh proof and a reason; audited; a roll is undone once, even by two undos at the same moment
- [x] The class can be rolled again (the cancelled place is revived, not duplicated) and a pupil can be enrolled by hand into it
- [x] History: an undone roll is marked with when, who and why; "Undo this roll" with the reason and the password; the refusal's pupils are listed in the dialog
- [x] Tests: unit, API and screens (x2 projects) new; mutation check (eleven rules broken together, 20 tests fail; the lock's own test is not separable); whole unit and API projects and the related screens run (2,856 passed)

## TASK-0041: The landing page

[Task file](0041-landing-page.md). Closes the open point of task 0033 ("a real landing page at `/` is a product decision"), asked for by the maintainer on 2026-11-10; built on `claude/octalve-landing-page`. No migration. AlEemaan gets its own landing page as a separate task and reuses the component.

- [x] `/` shows a landing page to a signed-out visitor instead of redirecting to `/login`; a signed-in person still goes to `/dashboard` and a fresh Solo install to `/setup`, in that order
- [x] The page says only what the product does today (each claim is listed in the task file with the screen it rests on); no sign-up, price, trial, figure or testimonial; two links, `/login` and `/verify`; the words live in `brand.landing`, the page in a shared server component
- [x] Accessible by construction: one `h1`, landmarks, headings in order, focus rings, works without JavaScript; Axe in both themes, no sideways scrolling at 320 px, text on the deep brand band measured at 4.5:1 or better
- [x] The specs that pinned the redirect (`sign-in`, `auth-logo`) say what is true now
- [x] Tests: unit, API and screens (x2 projects) new; mutation check in three rounds (it found that Axe cannot judge text over the patterned band, so a measured contrast test was added); whole unit and API projects and the related screens run (3,056 passed, 0 failed, 50 skipped)

## TASK-0042: The landing page's extra links come from the brand file

[Task file](0042-landing-links.md). A follow-up to task 0041, made so that AlEemaan's landing page can reuse the component as it is; built on `claude/octalve-landing-links`. No migration; nothing visible changes in Octalve.

- [x] `brand.landing.links` (`{ label, href }`, paths on this site): the first is the hero's quiet button and every one is in the footer; Octalve's is "Check a report card", `/verify`
- [x] The unit test holds the links (paths on this site, no repeats, never `/login`, no offer of a sign-up); the specs of task 0041 pass unchanged

## TASK-0043: A certificate is checked on the same public page as a mark

[Task file](0043-certificate-verify-page.md). The open point of task 0038 (the QR on a printed certificate opened JSON); built on `claude/octalve-certificate-verify`. No migration; no new route.

- [x] `/verify/[code]` answers for a mark, a school's own certificate and a certificate of completion (genuine, withdrawn, does not match the school's record, nothing found, or "the check did not finish" when a lookup is limited); never a score, an admission number or a certificate's metadata
- [x] The QR and printed address of a certificate are `<site>/verify/<token>` (`verifyLink`), never an API path
- [x] A browser that opens an old raw `/api/v1/verify/<code>` or `/api/v1/verify-certificate/<code>` address is sent to the page (`307`, relative `Location`, no attempt counted, `Vary: Accept`); scripts still get the same JSON
- [x] The check page takes a certificate's code, its whole link and the old raw addresses (nothing after the code)
- [x] Tests: unit, API and screens (x2 projects) new; mutation check in four rounds (15 mutations, each caught by its own test); 25 related spec files run on a clean build (309 passed, 0 failed, 1 skipped by design)

## TASK-0044: The landing page component takes its words, language and direction as props

[Task file](0044-landing-props.md). A prerequisite for AlEemaan's landing page about the school (its task 0049) and its Arabic version (0050); built on `claude/octalve-landing-props`. No migration; nothing visible changes in Octalve.

- [x] `LandingPage` takes optional `copy`, `name`, `labels`, `lang`, `dir` and `switchTo`; every default is what the page always said; a card's icon is optional; `ThemeToggle` takes optional `labels`
- [x] With no props every default is the literal it replaced: a source-level unit test holds it (a component cannot be rendered in the unit project: Playwright replaces React's JSX runtime); the props themselves are exercised by AlEemaan's specs (its tasks 0049 and 0050)
- [x] Tests: unit `landing-direction` (new, 4 tests, each caught by its own mutation); 169 passed, 0 failed, 3 skipped by design over the specs of tasks 0041 and 0042, sign-in, logo and the browser-wide responsive spec


## TASK-0045: Report-card PDFs draw every name and remark as written

[Task file](0045-pdf-unicode.md). The open point of task 0038 (decision D6: a Unicode font would draw every name exactly); built on `claude/octalve-pdf-unicode`. No migration; two new dependencies (`fontkit`, `bidi-js`).

- [x] Text WinAnsi can write exactly is drawn as before (same bytes, no font embedded); any other text (Yoruba marks, Arabic, Cyrillic, Greek, the naira sign) is drawn with embedded Noto Sans / Noto Naskh Arabic subsets: shaped (`fontkit`), put in order (`bidi-js`), searchable (`ToUnicode`); what neither font holds is still `?` and counted
- [x] Measuring, wrapping and the card's ellipsis work on the laid-out glyphs and cut between grapheme clusters; the document title and author are UTF-16 when they hold a mark
- [x] The fonts and their licence ship with the two report-card PDF functions (`outputFileTracingIncludes`; the build's trace files checked)
- [x] Read and drawn by software that is not ours: `pdftotext`, `pdffonts`, Ghostscript, and Chromium's output of the same text compared
- [x] Tests: unit `pdf-unicode` (new, 31 tests) and the report-card unit and API specs extended; mutation check of 16 changes, each run alone (13 caught by tests, 1 caught only after a test was added, 2 equivalent); the whole unit and API projects and three browser specs on a clean build: 2,881 passed, 0 failed, 0 skipped (unit and API) and 37 passed in three browser specs
- [x] Found by the regression: literal invisible characters in the new source, forbidden by `source-hygiene`; fixed as escapes
- [ ] Not built: right-aligning a right-to-left remark or mirroring the card; scripts neither font holds; the question bank's exam-paper writer (Latin-only, separate); a reader of Arabic or Yoruba looking at a printed card

## TASK-0046: A campus administrator reaches Results

[Task file](0046-campus-admin-results.md). Decision D7 of task 0031, approved by the maintainer on 2026-11-11; built on `claude/octalve-results-access`. No migration.

- [x] `CAMPUS_ADMIN` is on the results role lists (marks, review, import, remarks, report cards and their PDF) and on the Results page and sidebar
- [x] They read their campus's pupils and the school's, and enter marks, import them and write the teacher's remark only for pupils on the roll of a class of their own campus; a class of the whole school is 403, another campus's pupil, class or term the 404 of an unknown id; all or nothing
- [x] The principal's remark stays the school administrator's alone; unlocking a LOCKED result stays the school administrator's alone
- [x] **Found:** a campus administrator can never hold `CAN_APPROVE_RESULTS` (a database constraint), so approving and publishing their campus's marks is the school administrator's and the named approvers'
- [x] Tests: unit (`results-campus-admin`, the guard test for every results route, the menu), API (`results-campus-admin`: two campuses, 17 tests; `results-sheet` updated), browser (the Results page for a campus administrator); mutation check of 19 changes, each run alone, all caught; static gates; regression on a clean build: the first run found a real bug (the card and card-PDF routes asked `studentReadScope` of every role, so a teacher, a pupil and a parent got 403: 23 failures, fixed and held by two mutations); the second run unit and API 2,907 passed and 1 failed (`program-completion`, a feature this task does not touch, 401 for another school's administrator; it passed alone, 11 of 11, and I did not find the cause, so it is recorded as unexplained under load), browser 137 passed
- [ ] Open for the maintainer: whether a campus administrator should approve for their own campus (a migration or a rule); the principal's remark for them

## TASK-0047: The promotion screen says how many pupils have no published marks for the last term

[Task file](0047-promotion-final-term-advice.md). Decision D8 of task 0031, approved by the maintainer on 2026-11-11; built on `claude/octalve-promotion-advice`. No migration, no new route.

- [x] `previewPromotion` returns `finalTermGap`: the pupils to be rolled (no place in the next session yet) with no PUBLISHED or LOCKED mark for the session's last period; `null` when nobody is missing or the session has no periods
- [x] The promotion panel shows it in a warning in the preview and as a line in the confirm dialog; nothing is refused, the roll still goes through, and the advice is not stored in the batch
- [x] The rule is pure and in `choices.ts` (no imports, so the browser can run it), re-exported by `rules.ts`
- [x] Tests: unit `promotion-final-term` (new, 6 tests), API `promotion` (the preview: 3 pupils; null when nobody is missing; 1 when one is), browser `promotion-screens` (the preview and the dialog); mutation check of 9 changes, each run alone, all caught (N7 and N8 each fail a different browser test, so the preview's warning and the dialog's line are held apart); static gates clean
- [x] Regression on a clean build: unit and API 2,882 passed, 2 failed, 4 did not run (two tests that send many requests at once, run while four test lanes shared one database server: `finance` failed with "Too many database connections", `portal-practice` got a 500 and I did not read a connection message for it; both passed in full when run alone afterwards, 25 of 25); four browser specs 43 passed
- [ ] Open for the maintainer: whether the advice should become a refusal an administrator can override with a reason; naming the pupils or offering to publish the term from the dialog

## TASK-0048: The points left open by task 0032

[Task file](0048-scheme-points.md). The four points of task 0032, approved by the maintainer on 2026-11-11; built on `claude/octalve-scheme-points`. **One migration, the maintainer's: `20261127090000_exam_name`** (additive).

- [x] A school names its exam part (`AssessmentScheme.examName`): cleaned, 1 to 40 characters, never a component's name, only with an exam; on the sheet, the import template and the saved parts; in the snapshot only when set; frozen with the locked scheme (the trigger replaced); carried by a new version
- [x] The default grade scale locks with the first result it grades (shared scale lock, `lockScale`, one `GRADE_SCALE_LOCKED` audit row); a refused save locks nothing; afterwards a scale change is a new version
- [x] A bare score where the scheme has parts stays refused (pinned by an API test)
- [x] The scheme screen says a locked scheme is replaced by a new version
- [x] Tests: unit (the rule, the snapshot, the parts), API (`results-scheme-points`: the name end to end, the trigger, the bare score, the scale lock), the Academic setup screens; mutation check of 20 changes, each run alone, all caught; static gates; regression on a clean build, unit and API 2,902 passed and 0 failed, four browser specs 99 passed and 0 failed (earlier attempts were invalid: connection slots exhausted by parallel lanes, ports held by leftovers of a killed run, and a run lost without an error while the machine was short of memory; that last one had two failures in unrelated specs whose messages I did not read, and both passed in the final run)
- [ ] For the maintainer: run the migration; tell schools that a class's scheme is edited only as a new version after its first marks

## TASK-0049: The six waiting migrations become one

[Task file](0049-squash-pending-migrations.md). Asked by the maintainer on 2026-11-11 (no production or preview database exists yet); built on `claude/octalve-squash-migrations`. One migration replaces six; no schema change.

- [x] `20261122090000_progress_promotion_results` is the six files in their old order under banners; the six folders are removed
- [x] Same schema: `pg_dump --schema-only` of "the six in order" and "the one file", from the same base, identical (13,427 lines); a control with one of the six left out differs; none of the six writes data
- [x] A fresh test lane applied all 50 migrations with `migrate deploy`; `prisma migrate status` up to date; 292 API specs on these tables and the whole unit project (1,214) pass
- [x] Found: `scripts/lanes.mjs sync` left empty folders for removed migrations, which fails the setup step with P3015 for any lane; fixed (a directory gone from the checkout and empty is removed)
- [ ] Open for the maintainer: reset any local database that applied the old six (`octalve_edu`, `octalve_edu_test`: `prisma migrate reset`); whether to squash the 50 older migrations too; the old remote database described in HANDOVER section 3 (31 migrations, October) if it still exists

## TASK-0050: The whole migration history becomes one baseline

[Task file](0050-squash-all-migrations.md). Asked by the maintainer on 2026-11-11 ("squash all"; no production or preview database exists); built on `claude/octalve-squash-all`. 50 migrations become one; no schema change.

- [x] `20260927053552_baseline` is the final schema (`pg_dump --schema-only`, edited: psql-only lines and session settings removed, the migrator's role written as `CURRENT_USER`, control characters written as escapes); the 50 folders are removed
- [x] Same schema, compared as bytes: 13,391 of 13,404 lines identical, 13 CHECK lines differ only in AND bracketing, nothing else; a control differs; a reload is a fixed point
- [x] Fresh lane databases migrated by `migrate deploy`: unit and API 2,936 passed, integration 696 passed, five browser specs 145 passed, 0 failed
- [x] Found: a plain concatenation fails (enum values); my first file lost four carriage returns (text-mode read) and my first comparison could not see it (caught by `source-hygiene`); the `integration` project was not in earlier regressions and `rls.spec.ts` was red on `dev` since tasks 0036 and 0040 (fixed, four lines)
- [x] `question-bank-schema.spec.ts` no longer reads a migration file: two tests ported to the catalog (mutation-checked 3 of 3), two about historical file content removed
- [ ] Open for the maintainer: reset `octalve_edu`, `octalve_edu_test` and lanes 6 to 8 (`prisma migrate reset` / drop); the old remote database in HANDOVER section 3 if it still exists

## TASK-0051: A failed sign-in in a test says so, instead of showing up later as a 401

[Task file](0051-cookie-header-guard.md). The one unexplained failure left from task 0046's regression (`program-completion.spec.ts:104`, a 401 that passed alone straight afterwards); built on `claude/octalve-login-token-guard`. Test support only: no application code, no migration.

- [x] `cookieHeader` (`tests/support/http.ts`) throws when it is given `null`, `undefined` or `""`, naming the cause (the sign-in set no session cookie); before, `token!` turned `null` into the cookie `...=null` and the first protected call answered 401
- [x] `tests/unit/cookie-header-guard.spec.ts`, 3 tests; mutation-checked alone (the condition removed: 1 failed, 2 passed; restored: 3 passed)
- [x] Unit, integration and API projects on lane 1: 3,634 passed, 0 failed (138 calls of the helper in 88 spec files all still get a real token)
- [ ] Not found: why that one login failed (nothing was logged); `loginAs` still returns a null token without throwing, on purpose

## TASK-0052: The one baseline, checked further: adopting it on a database that has data, and the browser projects

[Task file](0052-baseline-adoption-verified.md). The maintainer's "and we need to resolve the weak spots" (2026-11-12), after the baseline of task 0050; built on `claude/verify-after-squash`. Documentation only: no code, no schema, no migration.

- [x] The adoption path (`prisma migrate resolve --applied`), tried on local throwaway databases: from a database made from either old history, and from the October shape brought up first; `status` up to date, `deploy` no pending migrations, schema equal to a fresh baseline database's (13 CHECK lines differ only in AND bracketing), data kept
- [x] Negative control: `migrate deploy` without adopting fails, changes nothing, but leaves a failed row that blocks later runs (`P3009`); the same adoption steps recover it; the variant that keeps the old rows also works
- [x] The `https` project and the 46 e2e files on the baseline: desktop run 384 passed, 9 skipped, 0 failed; phone run 342 passed, 43 skipped, 0 failed (skips are viewport conditions in the specs)
- [ ] Not done: any hosted database, the old remote database of HANDOVER section 3, data in tenant tables; the maintainer decides whether that database is dropped or adopted

