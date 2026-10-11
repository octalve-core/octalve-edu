# [0010]: Platform follow-ups - counters, first-administrator re-invite, teachers' attendance scoping, public verification, campus-admin setup controls

- **Period / Focus:** 2026-10-11 to (open) - the backlog the maintainer approved after TASK-0009 ("go on with all your recommendations")
- **Status:** In Progress - F1-F4 built and committed; the full suite is **(running)**; F5 not started
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/platform-followups` -> octalve-core `dev` (F5 in its own PR)
- **Started:** 2026-10-11 UTC
- **Ended:** -
- **Duration:** -

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Close what TASK-0009 left open: the platform page shows coarse counters and which schools have no administrator (F1), a platform administrator or an operator can re-issue a lost first-administrator invitation (F2, ISS-0015), a teacher reads attendance only for their campus and their own arms (F3, ISS-0013), the public verification page no longer shows the admission number (F4, ISS-0008), and a campus administrator can edit their campus's academic setup in the UI (F5).

## 2. Context & Related Docs
- Plan: "Build design - platform follow-ups (2026-10-11)" (F1-F5). ADR 0016 (Proposed) amended in the same design commit.
- Maintainer answers (2026-10-11): member counts are required; build BOTH the platform re-invite action AND the operator script; teachers' attendance scoping at campus level AND arm level now; show the student's name IN FULL on public verification.
- Issues: ISS-0008, ISS-0013, ISS-0015.

## 3. Work Breakdown
### F1: counters
- [x] tests first: `tests/integration/platform-stats.spec.ts` (17) seen failing (14 of 14 then, all "relation TenantStats does not exist"); API (`platform.spec.ts` list + a counter-following test) and e2e (`platform.spec.ts`: counters line, "No administrator" mark) were edited before the code but NOT run failing first
- [x] migration (additive) `20261023090000_tenant_stats`: `TenantStats` (RLS forced, owner-only policy), `tenant_stats_apply`/`_recompute` (EXECUTE revoked from PUBLIC), definer triggers on membership/student/campus, `platform_school_stats()`, backfill; Prisma model `TenantStats`; applied to the `octalve_edu` dev DB
- [x] service (`listSchools` merges the two functions; `PlatformSchool.counts`), route doc, Platform page (counters line, "No administrator" badge)
- Result: integration platform-stats 17, integration platform + rls, API platform, e2e platform (desktop + phone) - 112 passed after `pnpm build`; typecheck, lint, prettier clean. NOT run: the full suite (end of task), axe in the dark theme for the platform page.
### F2: re-invite the first administrator
- [x] tests first: `tests/integration/platform-first-admin.spec.ts` (7) and `tests/integration/invite-first-admin-script.spec.ts` (4) seen failing (11 of 11: the function / script did not exist); the API block (5 tests) and the e2e dialog steps were written before the code but NOT run failing first
- [x] migration (additive) `20261023090100_first_admin_invite`: `platform_authorize_first_admin_invite(tenant, email)` (live ADMIN count inside the school, platform audit row); service `reinviteFirstAdministrator` (one transaction: function, revoke open ADMIN invitations, create the new one, school audit rows); route `POST platform/schools/[id]/first-admin-invitation`; Platform page "Invite administrator" button + dialog for a school with no administrator
- [x] `scripts/invite-first-admin.mjs` + `pnpm platform-admin:invite-first-admin` (`--as` required, prints the link instead of mailing)
- Result: integration (first-admin 7, script 4, stats 17), route-role guard (8), API platform, e2e platform on desktop and phone - 57 passed after `pnpm build`; lint, typecheck clean. NOT run: the full suite (end of task), axe dark theme.
### F3: teachers' attendance reads and roll-call writes
- [x] tests first: `tests/api/attendance-access.spec.ts` (49: campus x arm matrix for roll-call reads, student history, roll-call writes and the arm list) seen failing against the F2 build (22 failed, 27 passed - the "allowed" cases passed, every "must be 404" case failed); `tests/e2e/attendance.spec.ts` gained a teacher test (written before the UI, NOT run failing first). The existing `tests/api/attendance.spec.ts` teacher was given a staff record and an assignment to armA ON PURPOSE (the new rule) - nothing loosened
- [x] `src/lib/attendance/access.ts` (`armAccess`, `studentAccess`, `listRollCallArms`); the roll-call GET and POST and the student-history GET call it; new `GET academics/attendance/arms`; the attendance screen uses that list and says "No class arms are assigned to you" when empty
- Result: attendance-access 49, attendance 15ish, campus-admin-academics, route-role guard, e2e attendance (desktop + phone), phase-1 lifecycle walk - 81 + 11 passed after `pnpm build`; typecheck, lint clean. NOT run: the full suite (end of task).
- Consequence for the maintainer: a teacher with NO assignment reads and writes no arm until an administrator gives them one; the "assigned" definition is a subject assignment OR a timetable slot of their staff record. A teaching member with no staff record has no arms.
### F4: public verification
- [x] test first: the public-verification test in `tests/api/results.spec.ts` was rewritten (full name incl. a middle name, no `studentAdmissionNo`/`studentInitials`, the admission number nowhere in the body, `X-Robots-Tag: noindex, nofollow` on success AND refusals, `no-store`, and a result pulled back to DRAFT stops verifying until republished) and seen failing (`studentName` undefined) before the change
- [x] `verifyPublicCredential` returns `studentName` (first, middle if any, last) and no admission number; the route sets the header on every response; `VerifyCertificateForm` follows (it is not mounted on any page today)
- Result: results.spec 10 passed after `pnpm build`; lint, typecheck clean. API change: `studentAdmissionNo` and `studentInitials` are GONE from `GET /api/v1/verify/[token]`, `studentName` is new (nothing in this repo consumed the old fields except the unmounted form). A separate "revoke link" control was NOT built (a token already dies with the result's status).
### F5: Academic setup editing for a campus administrator (own PR)
- [ ] e2e + axe both themes first; UI

## 4. Verification
Gate order: typecheck -> lint -> format:check -> build -> tests. Results are recorded here as they happen. Mutation passes: NOT RUN - pending, end of Phase 2.

## 5. Not decided / waiting on the maintainer
Accept ADR 0016 (amended) and ADR 0014 (AlEemaan).
