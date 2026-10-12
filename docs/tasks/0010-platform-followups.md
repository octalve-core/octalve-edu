# [0010]: Platform follow-ups - counters, first-administrator re-invite, teachers' attendance scoping, public verification, campus-admin setup controls

- **Period / Focus:** 2026-10-11 to (open) - the backlog the maintainer approved after TASK-0009 ("go on with all your recommendations")
- **Status:** Completed - F1-F4 merged (PR #8); F5 in its own PR
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
- Result: integration platform-stats 17, integration platform + rls, API platform, e2e platform (desktop + phone) - 112 passed after `pnpm build`; typecheck, lint, prettier clean. NOT run: the full suite (end of task), axe in the LIGHT theme for the platform page (at the time; added in the F5 PR - the app is dark by default so the earlier axe runs covered the dark theme).
### F2: re-invite the first administrator
- [x] tests first: `tests/integration/platform-first-admin.spec.ts` (7) and `tests/integration/invite-first-admin-script.spec.ts` (4) seen failing (11 of 11: the function / script did not exist); the API block (5 tests) and the e2e dialog steps were written before the code but NOT run failing first
- [x] migration (additive) `20261023090100_first_admin_invite`: `platform_authorize_first_admin_invite(tenant, email)` (live ADMIN count inside the school, platform audit row); service `reinviteFirstAdministrator` (one transaction: function, revoke open ADMIN invitations, create the new one, school audit rows); route `POST platform/schools/[id]/first-admin-invitation`; Platform page "Invite administrator" button + dialog for a school with no administrator
- [x] `scripts/invite-first-admin.mjs` + `pnpm platform-admin:invite-first-admin` (`--as` required, prints the link instead of mailing)
- Result: integration (first-admin 7, script 4, stats 17), route-role guard (8), API platform, e2e platform on desktop and phone - 57 passed after `pnpm build`; lint, typecheck clean. NOT run: the full suite (end of task), axe in the LIGHT theme for the platform page (added in the F5 PR; dark is the default and was covered).
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
- [x] `tests/e2e/campus-admin-setup.spec.ts` (sessions and classes, each in the dark AND the light theme, axe on each section and each dialog, desktop and phone; plus grading/assessment stay read-only) written first and seen failing (4 of 4 on the campus filter that should not exist); the UI follows: `SessionsPanel`, `ClassesPanel`, `SessionFormDialog`, `ClassGroupDialog` take `ownCampusId` (no campus picker, new rows fixed to the campus, a row the whole school owns shows "Set by the school" and no controls, a session's terms view is view-only for it, subjects read-only with a note); the page enables the two sections for a campus administrator
- Result: campus-admin-setup 11 passed (desktop + phone) after `pnpm build`; typecheck, lint clean. Not done on purpose: the timetable and attendance sections stay read-only for a campus administrator in the UI (their API is open to them); teachers' roll-call controls are read-only in the UI too (`readOnly` is true for every non-ADMIN) - found, not changed, worth a decision.

## 4. Verification
**Full one-lane suite (`pnpm build`, `TEST_LANE=1 TEST_TIMEOUT_SCALE=3`, 2026-10-11/12, 1.4 h) on the F1-F4 build: 1927 passed, 1 failed, 23 skipped.** The one failure is `tests/e2e/shell.spec.ts:226` (phone, "a tap outside the sheet (on the dimmed page) closes it"): `More` was clicked straight after sign-in and the sheet never opened - the same click-before-hydration family as the "Sign out from the More sheet" flake that also fails on unchanged `dev` (task 0009 §6). Run alone afterwards: 5 of 5 passed (6 with the setup test). Not proven to be the same cause; no test was changed or loosened. The `signedInAs` helper fix is still to do.
Gate order: typecheck -> lint -> format:check -> build -> tests. Results are recorded here as they happen. Mutation passes: NOT RUN - pending, end of Phase 2.

## 5. Not decided / waiting on the maintainer
Accept ADR 0016 (amended) and ADR 0014 (AlEemaan).

## 6. Follow-on after the maintainer's review (2026-10-13)
The maintainer accepted every recommendation of the review (including "accept ADR 0016"). Done here, in one small PR:
- [x] **ADR 0016 -> Accepted** (index updated; the amendment is accepted with it). **ADR 0010** gets an "Update" note: the platform page now owns later type changes, the env default stays for first-run setup only.
- [x] **Teachers and campus administrators can take the roll from the screen** (the attendance section was read-only for everyone but a school administrator; the API always allowed it). `tests/e2e/attendance.spec.ts` gained two tests (teacher, campus administrator), seen failing first (no "Mark All Present" button), then passing with the page change (`canTakeRoll`: ADMIN, CAMPUS_ADMIN, TEACHING_STAFF; registrars still look only).
- [x] **Pre-deploy check for ISS-0013:** `pnpm teachers:unassigned [-- <school-code>]` (read-only) lists the active teaching staff who would see no class arm under the new attendance rule. Run it against each live school before this ships and have an administrator assign them. `tests/integration/unassigned-teachers-script.spec.ts` (3) was written before the script but NOT run failing first. The opt-in "grace mode" was NOT built: the maintainer accepted keeping the rule as is.
- Not done / waiting: ADR 0014 (AlEemaan) acceptance and its superadmin list - see the AlEemaan repo.
