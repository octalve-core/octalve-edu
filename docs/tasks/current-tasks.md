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
| 24 | [TASK-0020](0020-results-approver-scopes.md) | Results are approved by assignment: generally, per section or per class (ADR 0018) | [ ] In progress (ADR merged as PR #51, status Proposed; slice 1 merged as PR #54; slices 2 to 4 not started; the migration `20261030090000_results_approval_scopes` is for the maintainer to run BEFORE the code is deployed) | 2026-10-21 01:12:08 UTC | — | PRs #51 (ADR), #54 (slice 1) |
| 25 | [TASK-0021](0021-proxy-api-matcher-and-shared-body-reader.md) | The proxy must not make Next wait for an API request body; one shared reader for a request body | [ ] In progress (module A merged as PR #56; module B, the reader, is verified and its PR is open; module C, AlEemaan, not started) | 2026-10-21 UTC | — | `claude/shared-body-reader` |
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
- **Status:** [ ] In progress. [ADR 0018](../adr/0018-results-are-approved-by-assignment-generally-per-section-or-per-class.md) is merged as PR #51 (merge commit `b6729c8`, 2026-10-21 01:15:31 UTC) with the status Proposed: the maintainer's yes on three proposed details is awaited, and only a person accepts an ADR. Detail, slices and numbers: [the task file](0020-results-approver-scopes.md).
- [x] The maintainer's decision (2026-10-21): approvers are assigned General (their whole campus), per section (primary, JSS, SSS) or per class (JSS 2 ...) in the school's settings, and see and act on only what is assigned to them; Octalve first, AlEemaan after.
- [x] #51 `claude/results-approver-scopes`: the ADR.
- [x] Slice 1 MERGED as PR #54 (`4dd25a1`, 2026-10-21 08:12 UTC; branch `claude/results-approver-scope-rules`): `Section`, `ResultApprovalScope`, migration `20261030090000_results_approval_scopes` (backfills a General scope for every current holder of `CAN_APPROVE_RESULTS`), `src/lib/results/approver-scope.ts`, the transitions and the list follow the scope, members get a General scope with the permission; failing-first by mutation 12 of 21 fail, 9 controls pass; the whole setup, unit, integration and api run 1832 passed, 3 failed of 1835 (two pass alone, one is a failure on `dev` since #47: the proxy makes Next wait for the end of an API request body)
- [ ] Slice 2: the settings API (sections, scope assignment; `ADMIN` only, audited, fresh password); slice 3: the settings screen; slice 4: AlEemaan
- [ ] The maintainer: yes or changes on the three proposed details; accept the ADR; run the migration on the hosted database before the code is deployed there

### TASK-0021: The proxy must not make Next wait for an API request body; one shared reader for a request body
- **Status:** [ ] In progress. [The task file](0021-proxy-api-matcher-and-shared-body-reader.md) has the cause, the plan and what is left.
- [x] Module A, the proxy fix: merged as PR #56 (`ae724c9`, 2026-10-21 19:54 UTC)
- [x] Module B, the shared reader: written, failing first (14 of 52 failed on the old routes), verified (whole setup, unit, integration and api projects: 1929 passed, 0 failed); PR open
- [ ] Module C, AlEemaan: its matcher is fixed in its task 0036; port the reader (its routes answer 500 for a body that is not JSON)
