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
- **Status:** Completed — slices A-E landed in octalve-core `dev` as PR #14 (full suite 1972 passed, 2 assertions updated); PR #15 status updates
- [x] Slice A: support grants on the school side (`SupportGrant`, RLS policies, time limits)
- [x] Slice B: support session on the platform side (`supportTenantId`, `platform_support_record`, read-only enforcement)
- [x] Slice C: declared areas across 31 school GET routes + source-level area guard
- [x] Slice D: UI panels (school support page, platform open-view dialog, persistent shell read-only banner)
- [x] Slice E: full suite verification and production deploy checklist

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


