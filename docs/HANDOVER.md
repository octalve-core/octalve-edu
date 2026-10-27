# Octalve Edu — Project Status & Handover Documentation

> **Last Updated:** 2026-10-21  
> **Scope:** Octalve Edu Multi-Tenant School Management SaaS (Canonical Reference Architecture)  
> **Repository:** `octalve-core/octalve-edu`  
> **Active Branch:** `dev` (54 commits ahead of `master` on 2026-10-21; `master` is `dev` as of PR #30 on 2026-10-18 and `prod` is 5 commits behind `master`: nothing since #30 has been promoted)  
> **Taking over? Read section 6 "Start here" first, then section 7 (how to work here), then `CLAUDE.md`.**

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
- **Latest Migration Applied on the live database:** `20261028090000_staff_and_guardian_extended_fields/migration.sql`. **Latest on `dev`:** `20261030090000_results_approval_scopes/migration.sql` (and `20261031090000_unsectioned_class_approval/migration.sql` once slice 2a of task 0020 is merged).
- **The 33rd migration is on `dev` (PR #54) and NOT on the hosted database:** `20261030090000_results_approval_scopes` (task 0020, section 6.0): it adds `Section`, `ResultApprovalScope`, `ClassGroup.sectionId` and the policies, and gives every membership that holds `CAN_APPROVE_RESULTS` a GENERAL scope. The maintainer runs `pnpm db:migrate:deploy` on the hosted database BEFORE the results code is deployed there (the migration is additive and the older code ignores the new tables, so migrate first).
- **The 34th migration came with slice 2a of task 0020 (merged, PR #64):** `20261031090000_unsectioned_class_approval` adds the enum `UnsectionedClassApproval` and `SchoolSettings.unsectionedClassApproval` with the default `GENERAL_OR_CLASS_ONLY` (nothing changes until an administrator turns it on). The maintainer runs `pnpm db:migrate:deploy` on the hosted database BEFORE the code is deployed there, after `20261030090000_results_approval_scopes`.
- **The next migration is the question bank's (task 0024, slice A, merged as PR #68; slices A to E are all merged: PRs #68, #69, #70, #71 and #72):** `20261101090000_question_bank` adds six enums and nine tables (items, pictures, versions, class tags, reviews, reviewers, similarity flags, the audit trail and the switches), each with `tenantId`, composite keys and row-level security enabled and forced in the same file, plus the checks and triggers that make the rules hold whichever code writes (at most 4 pictures, append-only history, visibility only moving forward in UTC, a switch change needing a fresh re-authentication). Nothing existing changes. The maintainer runs `pnpm db:migrate:deploy` on the hosted database BEFORE the code that reads it is deployed there. It needs the image-store variables (`IMAGE_STORE` and that backend's credentials) before pictures work on a hosted deployment (slice D is built: without a store the picture routes answer `503`, and the rest of the question bank works).

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

- **Suite Status (2026-10-21):** the last full run (every Playwright project, production build, 2.1 h) was on `dev` after PRs #36 to #44 on 2026-10-20: 2159 passed, 23 skipped (documented design skips), 2 failed; the two failures were test problems and are repaired by PR #48 (task 0019). It predates #45 to #51: **one full run on the current `dev` is still to be done** (when the machine is quiet; run it in its own lane, 7.3). The unit project on `dev` after #49: 396 passed.
- **RLS Guard:** `tests/integration/tenant-rls.spec.ts` verifies all tenant tables enforce Postgres Row-Level Security.
- **Cross-Tenant Guard:** `tests/api/tenant-boundary.spec.ts` executes automated IDOR attacks on every tenant-scoped endpoint.

---

## 6. Current work (2026-10-21)

### Start here: where things stand on 2026-10-21

**On `dev` (tip `4dd25a1`, PR #54, plus the docs PRs after it):** everything merged so far: PRs #36 to #54 of 2026-10-20 and 2026-10-21 (review fixes, teacher assignments for results, certificate verification by token, "a request that cannot be valid is a 4xx", the task records, the proposed ADR 0018 and slice 1 of it). `master` is `dev` as of PR #30 (2026-10-18), `prod` is 5 commits behind `master`; nothing since #30 is promoted, and promotion needs the maintainer's explicit approval. Neither product is live (maintainer, 2026-10-21): both are in development mode.

**In flight, not on `dev`:**
- **Slice 1 of ADR 0018 (task 0020) is MERGED**: PR #54, merge commit `4dd25a1`, 2026-10-21 08:12 UTC, after its Vercel check passed. It carries the migration `20261030090000_results_approval_scopes` (not yet run on the hosted database). Verification: failing-first by mutation (12 of the 21 new tests fail when `approverScope()` answers "general" for everybody, 9 controls pass), the migration rehearsed over seeded data (three holders got a GENERAL scope), and the whole setup, unit, integration and api projects: 1832 passed, 3 failed of 1835; two failures (two `mfa.spec.ts` tests) pass alone, the third is the proxy finding below.
- **The proxy fix is MERGED (task 0021, module A):** PR #56, merge commit `ae724c9`, 2026-10-21 19:54 UTC. The API entry of the proxy's matcher is `{ source: "/api/(.*%.*)" }`: only a path that contains a percent sign comes through the proxy (for the malformed-path 400), because Next buffers a proxied request's body until it ENDS (`node_modules/next/dist/server/body-streams.js`, `finalize()`), so a body that never ends was never answered and the routes' own 413 never ran. Still open, by design: a request to an API path that DOES contain a percent sign is buffered as before (the options are in the task file; the maintainer decides).
- **The shared request-body reader (task 0021, module B), branch `claude/shared-body-reader`, merged as PR #57, verified:** `readJsonBody()` in `src/lib/api/validate.ts` (the one place a body is read and parsed: bounded read, 413 / 400 `INVALID_BODY` / 400 `VALIDATION` for a NUL; `parseRequest()` uses it too) is used by the 16 routes that read their own body; the payment webhook and the student restore route read their raw text through `readBoundedText`; `tests/unit/route-body-guard.spec.ts` fails on a route that reads its body any other way; new specs: `tests/api/own-body-routes.spec.ts`, +1 in `setup.spec.ts`, +3 chunked stalls in `body-cap-chunked.spec.ts`, +6 unit tests. Verification: failing first on a production build of the old routes (14 of the 52 tests of the new and changed specs failed, 38 passed as controls; the three chunked stalls answered nothing within 20 s); on the branch prettier, eslint, the catalogs (415 rows) and `pnpm build` are clean and the whole setup, unit, integration and api projects passed: 1929 passed, 0 failed (lane 6, 33.8 minutes). NOT run: the e2e and https projects on the branch, and a full suite of every project on the merged `dev`.

**Next work, in order:**
1. Merge the reader branch (above) after its Vercel check; then the AlEemaan port of the reader (its `req.json()` routes answer 500 for a body that is not JSON and some have no size cap); then one full suite of every project on the merged `dev`.
2. Slice 2 of task 0020 (slice 1 is merged; ADR 0018 is Accepted; **slice 2a, the setting `unsectionedClassApproval` and the rule that reads it, is merged as PR #64 with the migration `20261031090000_unsectioned_class_approval` for the maintainer to run on the hosted database BEFORE the code is deployed there**; slice 2b, the sections and approvers routes, is merged as PR #65 with no migration): the settings API (sections: create, rename, archive, place class groups; approver scopes: assign and remove; and the school setting `unsectionedClassApproval`, `GENERAL_OR_CLASS_ONLY` by default or `ANY_SECTION_APPROVER`, which decides whether an approver with a Section scope may also act on class groups that have no section: the maintainer's decision of 2026-10-23, in the ADR's amendment), `ADMIN` only, audited, with a fresh password re-entry. Slice 3, the settings screen (a Results approval tab and the select for that setting; no migration), is built on `claude/results-approver-settings-screen`. Slice 4: the same in AlEemaan (branches for campuses, the superadmin for the administrator). Build to the proposed details until the maintainer answers.
3. AlEemaan: the same shared body reader and a central 400 for a body that is not valid JSON (see its `docs/HANDOVER.md` 6.0), after the Octalve branch is merged.
4. One full run of every Playwright project on the current `dev`.
5. The review items tracked outside the repository (the private tracker, section 7.6), each on its own branch off `dev` with a failing test first: among them the custom-domain check, campus isolation of communication and of guardian links, a shared helper for "which arms may this viewer see" (announcements and timetable reads), the staff view of unpublished results, the LMS audience and score cap, ids named in the body of LMS writes, loose ends of results entry, and invoice numbers (taken from a count inside the transaction, the shape ISS-0001 describes for receipt numbers; make them unique per school under a per-school lock, as certificate numbers are).
6. Screens for certificates and for results entry (`CertificatesConsole`, `ResultsEntryGrid` and `ResultsApprovalConsole` are built and not mounted), question-bank parity (its own design note first), the `/video-guide` pages and a responsiveness audit.
7. **Task 0033 (the walkthrough video and PDF) runs LAST.**

**What is most likely to bite a new session:** the servers under test are a production build, so a stale `.next` tests old code; a throwaway config in the tree fails `pnpm build`; the machine is shared and loaded, so use your own lane and a long timeout; a migration must be run by the maintainer, never by the AI; and everything pushed is public. All of it is in section 7.

### 6.0 ADR 0018 and task 0020: results are approved by assignment (generally, per section or per class): ADR merged as PR #51, slice 1 merged as PR #54

**Where it is:** [`docs/adr/0018-results-are-approved-by-assignment-generally-per-section-or-per-class.md`](adr/0018-results-are-approved-by-assignment-generally-per-section-or-per-class.md) is on `dev` (PR #51, merge commit `b6729c8`, 2026-10-21 01:15 UTC) with the status **Accepted** (the maintainer confirmed the three details, "yes to all three", on 2026-10-23). Task: [`docs/tasks/0020-results-approver-scopes.md`](tasks/0020-results-approver-scopes.md) (register row 24). Slice 1 is merged (PR #54, `4dd25a1`).

**The maintainer's decision (2026-10-21, their words):** staff can be assigned to approve results "generally or per section (JSS, SSS, primary) or per class (JSS 2, JSS 3 and so on) but based on superadmin settings: so they see what is assigned to them; General Approvers see their whole campus's results". They also said to do Octalve first and AlEemaan after, with the same design.

**What slice 1 builds (every part is on the branch, none is on `dev`):**
- **Schema and migration `20261030090000_results_approval_scopes`:** `Section` (school, optional campus, name 1 to 80 characters, sort order, `archivedAt`; one live name per campus, case-insensitively), a nullable `ClassGroup.sectionId`, and `ResultApprovalScope` (person, kind `GENERAL` | `SECTION` | `CLASS`, the section or class group it names, who set it). A check keeps kind and target consistent and a unique index keeps a person's scope rows distinct. The migration BACKFILLS a `GENERAL` scope for every membership that holds `CAN_APPROVE_RESULTS` before row-level security is enabled, so nothing changes on the day it is deployed. Policies: `Section` can be read, inserted and updated (never deleted: archive, ADR 0004); `ResultApprovalScope` can be read, inserted and deleted (never updated).
- **One function answers the question:** `src/lib/results/approver-scope.ts`: `approverScope` (a `GENERAL` row wins; otherwise the arms of the class groups of the assigned LIVE sections plus the arms of the assigned class groups; an archived section covers nothing; no rows means no scope, fail closed) and `inScopeResultIds` (a result is in scope when its student has an ACTIVE enrolment, in the session of the result's period, in a covered arm). The results list and the transitions both ask it, so what a person sees and what they may do cannot drift apart.
- **The transitions:** `transitionResultStatuses` holds an approver without a general scope to the results in their scope for every transition that needs approval authority; an out-of-scope result is refused as `UNAUTHORIZED` ("This result is outside the classes you approve results for."), not as "not found", and the batch moves nothing; the author's own submit (DRAFT to SUBMITTED) is not an approval and is not scoped; an `ADMIN` is held to no scope.
- **The list:** `queryResults`: a teacher sees the arms they are assigned to plus, when they hold `CAN_APPROVE_RESULTS`, the arms of their scope; a person with a `GENERAL` scope is held to the campus rule alone (this replaces the interim exception of task 0018, which the maintainer was not asked about).
- **Members:** `changeMember` gives a person who is granted `CAN_APPROVE_RESULTS` a `GENERAL` scope (audit `RESULT_APPROVAL_SCOPE_CHANGED`, same transaction) and removes every scope when the permission is taken away.
- **Tests:** `tests/api/results-approver-scope.spec.ts` (new: scope general, section, class and none against the list and every transition, an archived section, the union with assigned arms, the wording of the refusal, the author's own submit, an administrator, the members default and its removal, the database checks and the unique indexes); `tests/integration/rls.spec.ts` (the two tables and their policies); `tests/support/db.ts` has `grantApprovalScope`, which the three results specs that make an approver now call; `tests/integration/members.spec.ts` expects the new audit row.

**Slice 1 is merged (PR #54, `4dd25a1`):** the migration `20261030090000_results_approval_scopes` is for the maintainer to run on the hosted database BEFORE the results code is deployed there (it is additive; the previous code ignores the new tables, but that order was not run). Everything above this line describes what the slice builds; what is left of task 0020 is slice 2 (settings API), slice 3 (settings screen) and slice 4 (AlEemaan), see `docs/tasks/0020-results-approver-scopes.md`.

**Rules learned (they apply to new code):**
- Which classes a person approves is data (`ResultApprovalScope`), not a permission: `CAN_APPROVE_RESULTS` says whether, the scope says where; no scope means no approving.
- A list and the actions on the same records ask ONE function for "which arms", never two copies.
- A refusal says why: an approver whose scope does not reach a result is told that, not that they lack a permission they hold.
- A test that gives one person a staff record or a subject assignment removes it before the next test (a `beforeEach`), or the next test sees it.
- A migration that adds a table and backfills it must backfill BEFORE row-level security is enabled, and the table list in `tests/integration/rls.spec.ts` is updated in the same commit.

### 6.1 A request that cannot be valid is a 4xx, and two tests that failed only under load: merged into `dev` as PRs #47, #48 and #49 (2026-10-21)

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

**Open / next:** (1) port the query-string and body scans to AlEemaan; (2) one shared reader with the NUL scan for the 16 routes that read their own body; (3) after the promotion to `prod`, record what these fixed in `docs/issues/README.md` (the maintainer decides the wording while the repository is public); (4) the rest of the items of sections 6.2 and 6.3.

### 6.2 Teacher assignments for results, and certificates: merged into `dev` as PRs #45 and #46 (2026-10-20)

**Where the code is:** on `dev` (tip `a17baa3` after the two merges), merged on 2026-10-20 at #45 at 21:38 and #46 at 21:39 UTC under the standing authority to merge into `dev` after the checks pass (Vercel SUCCESS, `base.ref` checked to be `dev`): #45 `claude/fix-results-assigned-subject-arm` (two commits) and #46 `claude/fix-certificates-verify-and-access` (two commits, **a migration**). The remote branches are kept. These merges are on `dev` only: nothing is promoted to `master` or `prod`, and never promote without the maintainer's approval. Task: [`docs/tasks/0018-teacher-assignments-for-results-and-certificate-verification.md`](tasks/0018-teacher-assignments-for-results-and-certificate-verification.md) (register row 22).

**The migration (the maintainer's to run):** `20261029090000_certificate_verification_token`. Run `pnpm db:migrate:deploy` on the hosted database BEFORE the certificate code is deployed there. It adds `Certificate.verificationToken` (every existing certificate is given its own), makes the certificate number unique within a school instead of across all schools, and adds the policy `certificate_public_verification`. The release before it keeps working on the migrated schema (checked: that build issues, lists and revokes a certificate against a migrated database); the other order would make every certificate read fail until the migration is run, because the new code names the column. Nothing is lost and nothing needs backfilling.

**What they do (the rule each one adds):**
- **Results entry:** a teacher records a subject only for students on the ACTIVE roll, in the period's session, of an arm in which they hold a subject assignment for that subject; one student outside refuses the whole request (403, nothing saved). An administrator is not held to it; a timetable slot does not count for recording.
- **Results list:** a teacher lists the students on the ACTIVE roll of the arms they are assigned to (a subject assignment or a timetable slot, as for attendance); the filters only narrow it; no assigned arm gives an empty list. A teacher who holds `CAN_APPROVE_RESULTS` keeps the campus-ruled list (approving other teachers' results needs to see them). **This exception was a decision made here that the maintainer was not asked; on 2026-10-21 the maintainer answered with a different design (approvers are assigned by scope, section 6.0 and ADR 0018), which replaces it.**
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

**Open / next:** (1) one full suite on `dev` with #45 to #49 merged (the last one, 2159 passed, 23 skipped, 2 failed, predates #45 and #46; its two failures are repaired in task 0019); (2) the maintainer runs the certificate migration on the hosted database before the certificate code is deployed there, (the approver exception is answered: section 6.0); (3) after the promotion to `prod`, record what these fixed in `docs/issues/README.md` (the maintainer decides the wording while the repository is public); (4) a screen for certificates (issue, revoke, show the verification link) and for results entry is the product gap behind these API rules; (5) further review items found by the same review are tracked outside the repository (it is public) and are the next work, each on its own branch off `dev` with a failing test first.

### 6.3 Review fixes: merged into `dev` as PRs #36 to #43 (2026-10-20)

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

Not decided for Octalve: the question bank and the Forms module were designed for AlEemaan first (see AlEemaan `docs/HANDOVER.md` section 6). Octalve parity (tenant-scoped, RLS) has its own note, `docs/development-history/forms-and-question-bank-parity.md`; all six of its decisions are answered (D4, what a parent account sees, on 2026-10-23: a school setting `bank.parents.view` with the values `NONE` (default), `SUMMARY` and `FULL`). The build is task 0024 (`docs/tasks/0024-question-bank.md`): slices A (schema), B (reviewers and switches), C (questions and review), D (pictures) and E (the screens: Browse, My questions, Review queue, a navigation entry for staff) are all merged into `dev` (PRs #68 to #72, 2026-10-26). `bank.parents.view` is stored and edited from slice B but nothing reads it yet: it is used from the slice that shows questions to parents.

**Deferred, runs last (maintainer, 2026-10-19): walkthrough video and PDF that double as a flow audit, for this project on its own.** One continuous journey from a freshly set-up empty database, driven only by what a person can do in a browser (click, type, choose files, follow links: no SQL, no API calls, no deep-link jumps, no silent "if visible" skips), recorded in desktop light, desktop dark and phone; findings are fixed (defects and missing screens, with tests; product choices are asked). The full specification is AlEemaan `docs/tasks/0033-walkthrough-flow-audit.md`; the Octalve-specific parts (tenant onboarding, platform superadmin, support access, custom domains, Paystack mock, messaging stand-ins) get their own coverage matrix when it starts. It runs after all other tasks, and the maintainer confirmed (2026-10-19) that **Octalve's question-bank parity (its own design note, then the build) comes first**. The maintainer also said "yes merge": the AI may merge PRs into `dev` once the full suite shows no failure that is not already failing on `dev` and `base.ref` is verified to be `dev`; never into `master`/`prod` without explicit approval.

---

## 7. How to work here: authority, habits, running the tests, clean-up (2026-10-21)

This section is the portable copy of what the previous AI session knew from the maintainer's instructions. It does not replace the working rules in [`CLAUDE.md`](../CLAUDE.md); it adds the rules that were given in conversation and the practical knowledge of running this repository's tests on a shared machine. A session that starts from this repository alone (another AI, another tool, or a person) has everything it needs here and in the files this section names.

### 7.1 Who may do what

- **The maintainer** is the git user `roji-tech`. Product decisions are theirs. When a decision is genuinely theirs, ask one question and lead with a recommendation; when a conventional default exists, take it and say so in the PR.
- **Merging into `dev`:** the AI may merge a PR into `dev` after its checks pass, as a MERGE COMMIT, and keeps the remote branch. The gate is: the PR is open, `base.ref` is `dev`, the head is the commit that was tested, the Vercel check is `SUCCESS`, and GitHub says `MERGEABLE`. The helper that checks all five and then merges is `bash /home/rojitech/Desktop/CODEC/out/tools/guarded-merge.sh <owner/repo> <pr> <tested-head-sha-prefix>`.
- **Never without the maintainer's explicit approval, each time:** merging or promoting into `master` or `prod`; accepting an ADR (an agent may draft one, only a person accepts it, so it stays "Proposed"); running a migration on a hosted database or writing a Vercel secret (the AI is blocked from both anyway: a PR that ships a migration says so and gives the run order).
- **Pushing:** "push it" means push and nothing more. Pushing a branch and opening a PR are part of the normal flow; merging is only under the rule above.
- **Not yours to touch:** the maintainer's own worktrees and checkouts, their running processes, and the local database and Redis containers. Remove only what you made (7.4).
- **A refusal by the permission system is not an obstacle to route around:** reword or stop, and tell the maintainer exactly what was blocked and the command they can run themselves.
- **Task 0033** (the walkthrough video and PDF that double as a flow audit) runs LAST, after all other tasks.

### 7.2 Habits that apply to every task

1. **Hunt for bugs, design gaps and user-flow gaps** in every task, not only the ones named; **fuzz and edge-test anything security-relevant** (hostile, malformed, oversized, replayed, concurrent input); **test the UI and the user flow** of every screen touched and its neighbours (empty, loading, error and success states, wording, keyboard and focus, both themes, phone width, axe, dead ends, an API with no screen). Report what you found, including what you did not fix.
2. **A test is seen to fail first.** Run every new test on an UNFIXED production build (a worktree of `dev` with only the new specs and helpers) and check that it fails for the intended reason, with the controls passing; record the counts. If a failing-first run is impossible (a new table), say so in the PR.
3. **Comprehensive commit messages and PR bodies (ADR 0013):** What, Why, Decisions, the bugs found on the way, and the tests: what failed first, what ran (names and counts), and what was NOT run. Commits end with the `Co-Authored-By:` trailer of the model that wrote them; PR bodies end with the "Generated with Claude Code" line.
4. **Docs in the same pass:** with every batch update the task file and `docs/tasks/current-tasks.md`, the progress tracker (`docs/development-history/octalve_edu_progress.md`), section 6 of this file, the `CLAUDE.md` banner, and the code catalogs (`docs/pages`, `docs/components`, `docs/functions`: one row per tracked file under `src/`, in the same commit as the file; `python3 /home/rojitech/Desktop/CODEC/out/tools/verify_catalogs.py <repo>` checks them; a file that is not yet `git add`ed shows as EXTRA). The private tracker `/home/rojitech/Desktop/CODEC/out/tasks.md` gets an entry as well. Docs go on a docs-only branch off `dev`.
5. **Both repositories are PUBLIC; neither product is live (maintainer, 2026-10-21).** In anything pushed (commit, PR, code comment, test name, catalog row, `docs/issues` row) describe the rule the code now enforces, in neutral words, never a way to exploit the old behaviour: no reproduction steps, no secrets. Exploit detail goes in the private tracker only (`/home/rojitech/Desktop/CODEC/out/tasks.md` and `octalve-review-leads-2026-10-20.md`, both outside git). `docs/issues`: write a row the moment a problem is suspected (where, what, status, and an honest `Live?` column); the maintainer chose that on 2026-10-21 (option C).
6. **No fallback secrets in source:** a missing secret fails closed. Keep AlEemaan in step with this repository (Octalve's design is canonical for shared parts, AlEemaan is stricter); a fix in one is checked against the other and the result recorded in both HANDOVER files, including "checked, not affected".
7. **Do not run two full suites at once** on the same machine, and give each lane its own number (7.3).
8. **Always clean up when done (7.4).**

### 7.3 Running the tests here

- **The servers under test are a production build** (`next start`): run `pnpm build` after any source change or the specs test the old code. `pnpm build` runs `prisma generate` first and type-checks the tests and any `.ts` file at the repository root, so a throwaway config must NOT be in the tree while it builds (TS2352). `tsc --noEmit` alone shows only `LayoutProps` (a Next type that exists after a build): that is not an error.
- **Lanes:** `TEST_LANE=n` shifts the ports by 10 x n and uses the database `octalve_edu_lane<n>_test` on `:5433` (credentials in section 3), so several runs can share the machine (`pnpm lanes:sync` and `pnpm test:lanes` are the repository's own helpers). The suite migrates that database itself. Drop the lane databases when you are done (`DROP DATABASE octalve_edu_lane<n>_test;`).
- **Playwright projects:** `setup`, `unit`, `integration`, `api`, `e2e-desktop`, `e2e-mobile`, `https`. A whole `setup` + `unit` + `integration` + `api` run is about 45 minutes at load 15 to 30; a full run of every project is about 2 hours.
- **The shared machine is often at load 15 to 30:** run with `--timeout=120000`, and raise the web servers' START-UP wait from 60 s to 240 s with a throwaway config that changes nothing else: `/home/rojitech/Desktop/CODEC/out/tools/pw-wrapper.config.ts`, copied into the worktree as `pw-full-wrapper.config.ts` for the run and deleted afterwards (`/home/rojitech/Desktop/CODEC/out/tools/run-lane.example.sh` does exactly that). Example: `TEST_LANE=3 nice -n 5 pnpm exec playwright test --config=pw-full-wrapper.config.ts --timeout=120000 --reporter=list tests/api/<spec>`. A test that fails only under load must be shown to pass alone before it is called load-sensitive, and then repaired (task 0019 is the pattern), not retried.
- **Expectations that are tests' own business:** the `tests/integration/rls.spec.ts` table list is updated with every migration that adds a tenant table; migrations backfill BEFORE row-level security is enabled; the test fixture client `db` bypasses RLS (the app client does not).
- **Long jobs:** start them in the background (`run_in_background`) with a log, wait for the log's own `== run done` marker with an `until grep ...; do sleep 5; done` loop, and trust that marker, not the launcher's "completed". A log that contains a NUL character is binary to `grep`: use `grep -a` or `tr -d '\000'`.

### 7.4 Clean-up checklist (after every batch)

1. Remove the worktrees you made once their branch is merged or dropped (`git worktree remove`; a refusal by the permission system means: give the maintainer the exact command). KEEP a worktree that holds unmerged work.
2. Delete the merged LOCAL branches you made. Never delete a remote branch.
3. Stop your own processes (`bash /home/rojitech/Desktop/CODEC/out/tools/find-lane-procs.sh <worktree> <lane>` lists one lane's PIDs). Never `pkill -f` or `pgrep -f` with a pattern that appears in the same command line: it matches itself.
4. Drop your scratch and lane databases; delete throwaway configs (`pw-full-wrapper.config.ts`, `.env` copies), `test-results`, `playwright-report` and `.next` in your worktrees.
5. At the very end of a long session clear the big scratchpad files.

### 7.5 Tool habits that cost time when forgotten

- A Write, Edit or Bash call can turn a backslash-u escape sequence in the text you send into the real character. Write such sequences with a doubled backslash, look at the result with `git diff`, and keep `tests/unit/source-hygiene.spec.ts` green.
- The Edit tool needs the file to have been Read in the same session; `sed` does not count.
- Run `pnpm exec prettier --check` on every file you changed before committing.
- A new local branch made from `origin/dev` tracks `origin/dev`: `git branch --unset-upstream`, then `git push -u origin <branch>`.
- `git log --format=%h`, not `--format=x`. Use the scratchpad directory for your own files, not `/tmp`.

### 7.6 Where the things that are not in git live

- `/home/rojitech/Desktop/CODEC/out/tasks.md`: the maintainer's single task tracker for both repositories (an entry per session, with the private findings).
- `/home/rojitech/Desktop/CODEC/out/octalve-review-leads-2026-10-20.md`: the unverified review leads from the catalog run (PRIVATE).
- `/home/rojitech/Desktop/CODEC/out/tools/`: the helper scripts named above, with a README.
- The previous AI session's own memory notes live in the maintainer's Claude Code profile and load only into a Claude Code session started in this project. Everything in them that matters is in this section and in section 6.
