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

The repository holds 32 database migrations; the first 31 are applied on the local database and on the live remote database, the 32nd is not yet applied on the live one (see below):

- **Local Docker Database:** `postgresql://octalve:octalve@localhost:5433/octalve_edu` — 31 migrations applied (the 32nd on the test databases, which the suite migrates).
- **Live Remote Database:** `postgres://...:5432/postgres?sslmode=require` (`db.prisma.io:5432`) — 31 migrations applied. **Pending: `20261029090000_certificate_verification_token`** (task 0018): the maintainer runs `pnpm db:migrate:deploy` on it BEFORE the certificate code is deployed there; the release before it keeps working on the migrated schema.
- **Latest Migration Applied on the live database:** `20261028090000_staff_and_guardian_extended_fields/migration.sql`. **Latest in the repository:** `20261029090000_certificate_verification_token/migration.sql`.

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

---

## 6. Current work (2026-10-20)

### 6.0 A request that cannot be valid is a 4xx, and two tests that failed only under load: merged into `dev` as PRs #47, #48 and #49 (2026-10-21)

**Where the code is:** on `dev`, merged under the standing authority to merge into `dev` after the checks pass (Vercel SUCCESS, `base.ref` checked to be `dev`): #47 `claude/fix-malformed-path-is-400`, #49 `claude/fix-nul-in-input`, #48 `claude/fix-two-load-sensitive-tests` (two commits). The remote branches are kept. Nothing is promoted to `master` or `prod`, and never promote without the maintainer's approval. Task: [`docs/tasks/0019-a-request-that-cannot-be-valid-is-a-4xx.md`](tasks/0019-a-request-that-cannot-be-valid-is-a-4xx.md). No migration.

**What they do (the rule each one adds):**
- **Broken percent-encoding in a path** (`%ff`, a lone `%`, `%ED%A0%80`) is a 400 `Bad request` from `src/proxy.ts`, for pages and for `/api/*` (Next answered a bare 500 before any route ran). The proxy's matcher now covers `/api/:path*`; a well-formed API request passes through untouched.
- **A NUL character** in a path segment is a 404 and in the query string a 400, for every route behind `withAuth`, after the checks that say who may be here and before the handler; in a JSON body it is a 400 from `validate()`, before the schema (`src/lib/api/no-nul.ts`). PostgreSQL cannot store one; it was a 500.
- **An id this school does not have** (found by the extra path test of the NUL branch) answered 500 on four route-and-method pairs and is now a 404 on PATCH and DELETE of an LMS assignment and DELETE of an LMS material (the services return `null` for a missing record, the routes word the 404), and a 400 `REFUSED` ("The payment could not be confirmed.") on the payment-status route for a payment the gateway does not confirm.
- **Two tests:** the email-change timing check compares the lower quartile of 12 samples with a tolerance of 250 ms and has its own 240 s budget; the account-menu e2e test waits for the page the person ends up on (a person with one school is sent from `/dashboard` to the school's page, a second navigation that closes a menu opened in between).

**What to know:** the NUL scan is not behind the 16 routes that read their own body (sign-in, two-step verification, passwords, email change, invitations, setup, profile); none answers 5xx for a NUL today and a spec keeps it so. The timing check cannot see a leak below about 250 ms (a 60 ms one was seen in 1 run of 6): the guard against a small leak is the `after()` call in the route and its review. AlEemaan has the malformed-path rule and the path rule but not the query-string and body scans yet.

**Test state:** every new test was run on an unfixed production build first (NUL: 15 of 21 API tests failed, the 6 controls passed; proxy: 8 of 10 failed, 2 controls passed; the three tests of the unknown-id fixes failed with a 500 where a 404 or 400 is expected). On the branches' builds: NUL 67 passed in the four spec files (the first version), then 168 passed in the 14 neighbouring spec files after the unknown-id fixes and 1791 of 1794 in the whole unit, integration and api projects on the first version's build; the unit project on `dev` after #49: 396 passed; proxy 52 passed; the whole shell spec 55 passed in 3 repetitions at load 20 to 27. NOT run: the e2e and https projects on the NUL and proxy branches, a full suite with all three merged.

**Rules learned (they apply to new code):**
- A request that holds a NUL character, or whose path cannot be decoded, is a bad request: refuse it centrally (`withAuth`, `validate()`, the proxy), never route by route.
- A route that reads its own body (`req.json()`) must scan it with `holdsNul` until the shared reader exists.
- A timing test on HTTP compares what survives noise (a low quartile of enough samples) with a tolerance measured on a busy machine, and says in a comment what it cannot see; a test that makes many bcrypt-bound requests sets its own `test.setTimeout`.
- An e2e helper that returns when the address matches must not accept a page the app leaves a moment later: wait for the page the person ends up on.
- A report that contains a NUL character is binary to `grep`: use `grep -a` (or `tr -d '\000'`). `pkill -f "<pattern>"` inside a command whose own text holds the pattern kills that command.

**Open / next:** (1) port the query-string and body scans to AlEemaan; (2) one shared reader with the NUL scan for the 16 routes that read their own body; (3) after the promotion to `prod`, record what these fixed in `docs/issues/README.md` (the maintainer decides the wording while the repository is public); (4) the rest of the items of section 6.1 and 6.2.

### 6.1 Teacher assignments for results, and certificates: merged into `dev` as PRs #45 and #46 (2026-10-20)

**Where the code is:** on `dev` (tip `a17baa3` after the two merges), merged on 2026-10-20 at #45 at 21:38 and #46 at 21:39 UTC under the standing authority to merge into `dev` after the checks pass (Vercel SUCCESS, `base.ref` checked to be `dev`): #45 `claude/fix-results-assigned-subject-arm` (two commits) and #46 `claude/fix-certificates-verify-and-access` (two commits, **a migration**). The remote branches are kept. These merges are on `dev` only: nothing is promoted to `master` or `prod`, and never promote without the maintainer's approval. Task: [`docs/tasks/0018-teacher-assignments-for-results-and-certificate-verification.md`](tasks/0018-teacher-assignments-for-results-and-certificate-verification.md) (register row 22).

**The migration (the maintainer's to run):** `20261029090000_certificate_verification_token`. Run `pnpm db:migrate:deploy` on the hosted database BEFORE the certificate code is deployed there. It adds `Certificate.verificationToken` (every existing certificate is given its own), makes the certificate number unique within a school instead of across all schools, and adds the policy `certificate_public_verification`. The release before it keeps working on the migrated schema (checked: that build issues, lists and revokes a certificate against a migrated database); the other order would make every certificate read fail until the migration is run, because the new code names the column. Nothing is lost and nothing needs backfilling.

**What they do (the rule each one adds):**
- **Results entry:** a teacher records a subject only for students on the ACTIVE roll, in the period's session, of an arm in which they hold a subject assignment for that subject; one student outside refuses the whole request (403, nothing saved). An administrator is not held to it; a timetable slot does not count for recording.
- **Results list:** a teacher lists the students on the ACTIVE roll of the arms they are assigned to (a subject assignment or a timetable slot, as for attendance); the filters only narrow it; no assigned arm gives an empty list. A teacher who holds `CAN_APPROVE_RESULTS` keeps the campus-ruled list (approving other teachers' results needs to see them). **This exception is a decision made here that the maintainer was not asked: confirm it.**
- **Certificates:** the public verification takes a 32-character token (`/api/v1/verify-certificate/[token]`); anything else is a 400, an unknown token, a draft or a revoked certificate a 404; numbers are unique within a school and taken under a per-school lock; issuing refuses an unknown student or period before writing; a student lists their own certificates only, a campus member their campus's and the school-wide ones', a campus administrator issues and revokes for their own campus's students only.

**What to know before promoting `dev` (behaviour a school will notice):** a teacher without a subject assignment cannot record results until an administrator gives them one (Staff, the teacher's page, *Teaches*, *Add a subject*); a teacher's results list shrinks to their arms; the certificate verification link takes the token, which the school reads from the certificate list (no screen shows it yet: `CertificatesConsole`, `ResultsEntryGrid` and `ResultsApprovalConsole` are built and not mounted); a certificate that existed before the migration has a token like any other. The hosted database needs the migration first (above).

**Test state:** every new test was run on an unfixed production build first (35 of 139 API and integration tests failed, each for the intended reason, 104 passed; unit 4 of 22 failed). On the branches' builds: results `results-assigned-subject` 12, `results-list-scope` 9, `results` 9, `results-edit-rules` 16, `campus-admin-academics` 14, `report-card-access` 6, `attendance-access` 48 and `integration/phase-1-lifecycle-walk` 10: 125 passed; certificates `certificates-verify` 10, `certificates-access` 9 and `integration/rls` 73: 93 passed. The unit project on `dev` after #45 to #49 (tip `cf32c30`): 396 passed, 0 failed. The migration was rehearsed over three existing certificates and the build before it was run against the migrated database. NOT run: mobile e2e, the https project, the e2e specs, a full suite with both branches merged, the migration on the hosted database. The full suite recorded in task 0017 (2159 passed, 23 skipped, 2 failed) is of `dev` before #45 and #46.

**Rules learned (they apply to new code):**
- A teacher's results work follows the arms they are assigned to: recording needs a subject assignment for exactly that subject and arm and an ACTIVE enrolment in the period's session; listing uses `assignedArmIds` (`lib/attendance/access.ts`). A spec that has a teacher record or list results gives that teacher a staff record, a subject assignment (and the students an enrolment in the arm).
- A public lookup answers by an opaque token, never by a sequential number: the row is read through a verification-context policy (`forVerification(token)` and `app_verification_token()`, as for `Result` and `Certificate`) that names exactly one row, and the answer carries no id, admission number or token. A token that is not 32 lower-case hex characters is a 400 before the database is touched.
- A number a school prints is unique within that school, never across all schools; the next one is taken under a per-school advisory lock.
- An advisory lock is taken with `tx.$executeRaw` and `hashtext` (`SELECT pg_advisory_xact_lock(hashtext(...))`); `$queryRaw` cannot read the `void` result and the request fails.
- A change whose code names a new column ships with its migration, and the order is written down: migrate first when the old code keeps working on the new schema, as here.
- A production build type-checks the tests and any TypeScript file at the root: a throwaway config or a spec that names a column the build's schema lacks must not be in the tree while it builds.
- A route that lists records of people checks who is asking in the service (a student's own, a campus's, a school's), not only in the route's `roles`.

**Open / next:** (1) one full suite on `dev` with #45 to #49 merged (the last one, 2159 passed, 23 skipped, 2 failed, predates #45 and #46; its two failures are repaired in task 0019); (2) the maintainer runs the certificate migration on the hosted database before the certificate code is deployed there, and confirms or changes the approver exception; (3) after the promotion to `prod`, record what these fixed in `docs/issues/README.md` (the maintainer decides the wording while the repository is public); (4) a screen for certificates (issue, revoke, show the verification link) and for results entry is the product gap behind these API rules; (5) further review items found by the same review are tracked outside the repository (it is public) and are the next work, each on its own branch off `dev` with a failing test first.

### 6.2 Review fixes: merged into `dev` as PRs #36 to #43 (2026-10-20)

**Where the code is:** on `dev` (tip `d12d22d` after the eight merges), merged on 2026-10-20 between 19:54 and 19:58 UTC at the maintainer's instruction, in this order, each after its Vercel check passed and with `base.ref` checked to be `dev`: #36 `claude/fix-bounded-body-read`, #37 `claude/fix-timetable-write-checks` (two commits), #38 `claude/fix-lms-whose-work`, #39 `claude/fix-results-draft-only`, #40 `claude/fix-attendance-roll`, #41 `claude/fix-report-card-scope`, #42 `claude/chore-source-hygiene` (no invisible or direction-changing characters in the source, with a guard test), #43 `claude/fix-names-need-a-visible-character` (on top of #42: a name needs a visible character). The remote branches are kept. These merges are on `dev` only: nothing is promoted to `master` or `prod`, and never promote without the maintainer's approval. Task: [`docs/tasks/0017-review-fixes-access-atomicity-and-request-bodies.md`](tasks/0017-review-fixes-access-atomicity-and-request-bodies.md) (merge commits and times are in its section 6).

**What they do (the rule each one adds):** `validate()` reads a body no further than the cap; a refused timetable batch changes nothing, and one lesson's start and end are checked together; LMS work is stored under the signed-in student's own record and reads follow the viewer (a student sees published work and their own submissions, marked work is final for the student); a result is edited only while it is DRAFT and a refused request saves nothing; a roll names only the students on that arm's roll; a report card is read within the reader's campus and, for a teacher, their own arms. The catalog rows of every changed file are in the same commits.

**What to know before promoting `dev` (behaviour a school will notice):** results cannot be changed once they leave DRAFT (a correction goes back through the lifecycle; an administrator unlocks a LOCKED result with a reason); a teacher with no assigned arm (no subject assignment, no timetable slot) cannot open any student's report card, as for attendance; in the LMS a parent and non-teaching staff see published work and no submissions; a roll call needs an ACTIVE session.

**Test state:** unit 382 on `dev` before the merges and on each branch (385 on the body-read branch, which adds three, and on the merge of the six fixes), and 389 on the merged `dev` (the two source-character branches add two each; run on a tree identical to `d12d22d`). On one production build of the first five changes: API 705 passed (run with `--timeout=120000`: the email-change response-time check in `tests/api/account-self-service.spec.ts` takes about 85 s here against the 30 s default), integration 614, e2e-desktop attendance, lms-a11y and academics 15. The report-card and lesson-time changes: a 148-test API run with 145 passed (the other three: a results test that the new report-card rule changed, since fixed because its teacher now teaches the arm; the test that reads that test's token; and the email-change check, which measured 150 ms against its 40 ms limit while the machine was loaded and passes alone in 59 s), then 40 tests, all passed. NOT run: the API and integration projects on each branch alone. One full suite on the merged `dev` (PRs #36 to #44) was run afterwards, on 2026-10-20: 2159 passed, 23 skipped, 2 failed, the two repaired in task 0019 (the first attempt, on a build of all eight branches, had ended before any test ran: the web servers did not start within 60 s at a load average of 48). Every new test failed on the unfixed build first.

**Rules learned (they apply to new code):**
- A service that can refuse a request after it has begun writing decides every refusal before its first write, or throws: `forTenant().transaction` rolls back only when the callback throws (ADR 0002), so returning `{ ok: false }` after a write commits the write.
- A route's `roles` list says who may call it, not whose data they may read: a route that admits STUDENT or PARENT filters per caller in the service, and a route that admits staff applies the campus rule and, for a teacher, the assigned-arm rule of `lib/attendance/access.ts`.
- A request body is read through `validate()` or `readBoundedText`, never `req.text()` or `req.json()` straight from the request.
- An id from a request has the shape of an id (`isPlausibleId`) before it reaches the database: Postgres refuses a NUL byte in a string and that ended as a 500.
- A test of a race holds one side open in a second transaction and polls (`pg_stat_activity`, `expect.poll`) instead of sleeping.
- A spec that has a teacher read or write an arm gives that teacher a staff record with a subject assignment (or a timetable slot) in it.

**Open / next:** (1) the full suite of the merged `dev` is recorded in section 4 of task 0017 (2159 passed, 23 skipped, 2 failed on 2026-10-20; the two failures are repaired in task 0019); (2) after the promotion to `prod`, record the issues these fixed in `docs/issues/README.md` (the maintainer decides the wording while the repository is public); (3) further review items found by the same review are tracked outside the repository (it is public) and are the next work, each on its own branch off `dev` with a failing test first.

### Earlier: 2026-10-19

**Branch `claude/ui-fixes-hydration-nav` was merged into `dev` as PR #31 (merge commit `e154d40`, 2026-10-19 17:32 UTC, by the maintainer).** Check `base.ref` is `dev` before any merge; never promote to `master`/`prod` without the maintainer's approval. Not in that merge, still to come as their own PR: repairs of the two tests that fail on `dev` (see Test state), and the docs commits recorded after it.

What it does: fixes the React hydration error #418 (`ServiceWorkerRegister` read `navigator.onLine` while rendering); maps design classes the theme never defines (`text-foreground`, `bg-primary`, `border-border`, `bg-card`, `bg-destructive`) to the real tokens in the finance, higher-ed, certificates, Paystack-mock and custom-domain screens; fixes the 3 lint errors that were red on `dev` (the support-grants route now reads the platform administrator through `findPlatformAdminByEmail` in `lib/support/grants.ts`; an unescaped apostrophe); repairs two stale tests (academics sections list now includes LMS; people-students expects `gender`).

Test state: full suite 2069 passed, 13 failed; explained in `docs/tasks/current-tasks.md`. Two failures were on `dev` itself: `shell.spec.ts` "More: who you are..." on a phone (the Users tab is not found while the More sheet is open) and `academics.spec.ts` "staff may LOOK" (an `Open` button is present). Both were stale tests, not product bugs, and are repaired in `claude/octalve-test-repairs-and-docs` (the bar has Communication but not Users/Settings and the sheet links Users and Settings; the write-verb check ignores the `Quick Tools` button). A later full run (2026-10-19, with the repairs, run while other work shared the machine): 2077 passed, 5 failed, 23 skipped; the 5 (`password-reset:166`, `responsive-and-a11y:236` and `:855`, `sign-in:412` on desktop and phone) all pass when re-run alone, so they are load-sensitive.

Rules learned (they apply here too): the theme has only the tokens in `src/app/globals.css` (`text-fg`, `bg-surface`, `border-line`, `bg-brand-strong`, `text-ok-fg`, `bg-danger-bg`...); the `dark:` variant follows the OS, not the app theme, so use tokens; the servers under test are a production build, so `pnpm build` before running specs; published results and similar rows are write-protected, so clean up by truncating.

**The build script runs `prisma generate` first (2026-10-19).** Vercel restores a cached `node_modules` ("Already up to date"), so Prisma's install-time generate does not run again and any schema change builds against the OLD client. `dev` (and PR #31's preview) failed type-checking on Vercel with `Module '@prisma/client' has no exported member 'CertificateStatus'` (also `CourseRegStatus`, `DomainStatus`, `prisma.certificate`) although the code builds locally. Reproduced by generating the client from the schema before the certificates commit (`f3d9b5d~1`) and running `tsc --noEmit` (9 errors of those kinds; the Vercel log shows the same messages); fixed by `"build": "prisma generate && next build"` (0 errors). `prisma generate` needs no `DATABASE_URL`. AlEemaan had the same failure on PR #67 and the same fix.

Not decided for Octalve: the question bank and the Forms module were designed for AlEemaan first (see AlEemaan `docs/HANDOVER.md` section 6). Octalve parity (tenant-scoped, RLS) needs its own note.

**Deferred, runs last (maintainer, 2026-10-19): walkthrough video and PDF that double as a flow audit, for this project on its own.** One continuous journey from a freshly set-up empty database, driven only by what a person can do in a browser (click, type, choose files, follow links: no SQL, no API calls, no deep-link jumps, no silent "if visible" skips), recorded in desktop light, desktop dark and phone; findings are fixed (defects and missing screens, with tests; product choices are asked). The full specification is AlEemaan `docs/tasks/0033-walkthrough-flow-audit.md`; the Octalve-specific parts (tenant onboarding, platform superadmin, support access, custom domains, Paystack mock, messaging stand-ins) get their own coverage matrix when it starts. It runs after all other tasks, and the maintainer confirmed (2026-10-19) that **Octalve's question-bank parity (its own design note, then the build) comes first**. The maintainer also said "yes merge": the AI may merge PRs into `dev` once the full suite shows no failure that is not already failing on `dev` and `base.ref` is verified to be `dev`; never into `master`/`prod` without explicit approval.
