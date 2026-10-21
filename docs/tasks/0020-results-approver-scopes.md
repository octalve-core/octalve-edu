# 0020: Results are approved by assignment: generally, per section or per class (ADR 0018)

- **Period / Focus:** 2026-10-21 onward (the maintainer's decision on how approvers are assigned, answering the open question of task 0018)
- **Status:** In Progress (the ADR is merged as PR #51 with the status Proposed; slice 1 is built and being verified on a local branch; slices 2 to 4 are not started)
- **Priority:** High
- **Assignee:** Agent (Claude); the maintainer accepts the ADR and runs the migration on the hosted database
- **Target Branch / PR:** `dev`; PR #51 (the ADR, merged); slice 1 `claude/results-approver-scope-rules` (no PR yet)
- **Started:** 2026-10-21 01:12:08 UTC (the first commit of the ADR)
- **Ended:** —
- **Duration:** — (the ADR took 3 min 23 s from its first commit to its merge)

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Approving results is assigned by scope instead of being one on/off permission: a person who may approve results is assigned **General** (every class of their campus), a **Section** (for example primary, JSS or SSS) or a **Class** (for example JSS 2), the school administrator sets this in settings, and the person sees and acts on only what is assigned to them (a General approver on their whole campus). Octalve first, AlEemaan after with the same design (branches for campuses, the superadmin for the administrator).

## 2. Context & Related Docs

- [ADR 0018](../adr/0018-results-are-approved-by-assignment-generally-per-section-or-per-class.md) (Proposed): the decision, the proposed details that wait for the maintainer's yes, the alternatives and what enforces it.
- The maintainer's words (2026-10-21): "we can assign staff for result approval generally or per section ( jss, sss, primary ) or per class (jss2 jss3 etc ) but based on superadmin settings: so they see what is assigned to them; General Approvers see their whole campus's results". And, asked whether to apply it to Octalve as well: yes, Octalve first and AlEemaan after.
- Task 0018 (teacher assignments for results): a teacher who holds `CAN_APPROVE_RESULTS` kept the campus-wide results list as an interim exception that the maintainer was not asked about; this task replaces it.
- `src/lib/results/rules.ts` (`canTransitionResult`), `src/lib/results/service.ts` (`transitionResultStatuses`, `queryResults`), `src/lib/attendance/access.ts` (`assignedArmIds`), `src/lib/members/service.ts` (`changeMember`), `prisma/schema/tenancy.prisma`, `academics.prisma`, `results.prisma`.
- Three details are the agent's proposed defaults and wait for the maintainer's yes (the build follows them): a section belongs to one campus and a class group is in at most one section; "per class" means the class group (all its arms); only the school `ADMIN` assigns scopes.

---

## 3. Work Breakdown (Grouped by Module / Sub-Phase)

### Module A: The decision (`claude/results-approver-scopes`, PR #51)
- [x] ADR 0018 written and merged with the status Proposed (two commits; the second corrected two things found while reading `transitionResultStatuses`: an action on an out-of-scope result is refused like a missing permission, not "not found", and a teacher's own submit is not an approval and is not scoped). Merge commit `b6729c8`, 2026-10-21 01:15:31 UTC.
- [ ] The maintainer's yes (or changes) on the three proposed details, then the ADR is accepted by a person.

### Module B: Slice 1, the model and the rules (`claude/results-approver-scope-rules`, a local branch in `../octalve-edu-approvers`)
- [x] Schema: `Section`, `ClassGroup.sectionId`, `ResultApprovalScope` (kind `GENERAL` | `SECTION` | `CLASS`).
- [x] Migration `20261030090000_results_approval_scopes`: the tables, a check that a section's name is 1 to 80 characters, one live section name per campus (case-insensitive), a check that a scope's kind and target agree, a unique index on a person's scope rows, a BACKFILL that gives every membership that holds `CAN_APPROVE_RESULTS` a `GENERAL` scope (before row-level security is enabled), and the policies (`Section`: read, insert, update; `ResultApprovalScope`: read, insert, delete).
- [x] `src/lib/results/approver-scope.ts`: `approverScope` and `inScopeResultIds`, the one place that answers "which results may this person approve".
- [x] `transitionResultStatuses`: approve, return, publish, revert and lock need the result to be in the approver's scope (an `ADMIN` is held to none; the author's own submit is not scoped); an out-of-scope result is refused as `UNAUTHORIZED` with its own wording and the batch moves nothing.
- [x] `queryResults`: a teacher sees their assigned arms plus their scope's arms; a `GENERAL` approver is held to the campus rule alone.
- [x] `changeMember`: granting `CAN_APPROVE_RESULTS` gives a `GENERAL` scope (audit `RESULT_APPROVAL_SCOPE_CHANGED`); taking the permission away removes every scope.
- [x] Tests: `tests/api/results-approver-scope.spec.ts` (new), `tests/integration/rls.spec.ts` (two tables, their policies), `tests/support/db.ts` (`grantApprovalScope`) used by the three results specs that make an approver, `tests/integration/members.spec.ts` (the new audit row).
- [x] Catalog rows (`docs/functions/school-app.md`) in the same commit.
- [x] `pnpm build` clean (type-checks source and tests), prettier clean; a targeted run on lane 3 of 11 spec files: 192 passed, 2 failed (both mistakes in the tests, repaired).
- [ ] The whole `setup` + `unit` + `integration` + `api` run on the branch's build (started on lane 3; result to be recorded here).
- [ ] A failing-first run: the new tables mean most of the new spec cannot run on an unfixed build; run what can (the list and transition behaviour for an approver with no scope) and say in the PR what could not.
- [ ] Reword the work-in-progress commit with the full message (what, why, decisions, tests run and not run, the migration's run order), push, open the PR into `dev`, wait for Vercel, merge with `guarded-merge.sh`.

### Module C: Slice 2, the settings API
- [ ] Sections: create, rename, archive and place class groups in a section; approver scopes: assign and remove. `ADMIN` only (never delegable, like permissions), every change audited with before and after, the administrator re-types their password first (as for the question-bank settings). Route-area and role guards, API tests, catalog rows.

### Module D: Slice 3, the settings screen
- [ ] A section in the school's settings: sections and their class groups, and per approver their scopes; empty, loading, error and success states, keyboard, both themes, phone width, axe.

### Module E: Slice 4, AlEemaan
- [ ] The same design in AlEemaan (branches for campuses, the superadmin for the administrator); its own ADR or a note that points to this one; its own migration for the maintainer to run.

### Module F: Docs
- [x] This task file, the register row 24, `octalve_edu_progress.md`, `HANDOVER.md` section 6 (6.0 and "Start here") and the banner of `CLAUDE.md` (written while slice 1 was being verified; each slice's merge updates them).

---

## 4. Unified Verification & Quality Gates
- [x] `pnpm build` (type-checks source and tests) and prettier clean on slice 1.
- [x] Targeted run on lane 3 (production build, 11 spec files: the new spec, `rls`, the three results specs, the two members specs, `permissions`, `phase-1-lifecycle-walk`, the route-area guard, `source-hygiene`): 192 passed, 2 failed. The two: the members spec expected the audit rows of a change that now also writes a scope row (updated), and one test of the new spec saw a staff record that an earlier test had left behind (a `beforeEach` now removes it).
- [ ] The two repaired tests re-run, then the whole unit, integration and api projects.
- [ ] Failing-first (see Module B).
- [ ] NOT run so far: the e2e projects and the https project (no page changed in slice 1).

---

## 5. Notes, Findings & Deviations
- **Why the scope is rows, not a list on the membership:** the ADR's alternatives: a list of ids has no foreign keys and no row-level-security target; a table with its own policy is the pattern of every tenant table.
- **Why a section is a new table, not a label on the class group:** a typo would split a section in two and the settings page would have nothing to offer.
- **The default that keeps today's behaviour:** every current holder of `CAN_APPROVE_RESULTS` becomes `GENERAL` in the migration, and every later grant does too until an administrator narrows it, so nothing changes on the day the migration is run.
- **Fail closed:** a person who holds the permission and has no scope row approves nothing and sees nothing beyond their assigned arms.
- **A dependency on the order of deployment:** the code names the new tables, so the migration is run on the hosted database BEFORE the code is deployed there (the older code ignores the new tables, so the other order is the one that breaks).
- **Open questions for the maintainer:** the three proposed details (section 2); whether an approver may also approve results of a class that has no section (today: only through a General or a Class scope).

## 6. Output & Deliverables
- **PRs:** #51 (the ADR; merged `b6729c8`, 2026-10-21 01:15:31 UTC). Slice 1: none yet.
- **Migration (the maintainer's to run, once slice 1 is merged):** `20261030090000_results_approval_scopes`.
- **Docs:** `docs/adr/0018-...md`, this file, `docs/functions/school-app.md`.
