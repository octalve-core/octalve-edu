# 0028: Standing - suspension, expulsion and termination on the school's own records (the Octalve Edu port of AlEemaan's task 0045)

- **Period / Focus:** design written 2026-11-04 (docs only); requested by the maintainer on 2026-11-03 for AlEemaan. The source is AlEemaan's `docs/tasks/0045-standing-suspension-expulsion-termination.md` (built and tested on its branch `claude/programs-p1`).
- **Status:** Design only. Nothing is built here.
- **Priority:** High (programs slice P2 reads it)
- **Assignee:** next AI / maintainer
- **Target Branch / PR:** one branch and one PR off `dev`

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
A student can be **suspended** or **expelled** and a member of staff **suspended** or **terminated**, as a real status on the school's own records that the rest of the system respects, with who decided, why and when kept for ever. Today Octalve's records have only `archivedAt` (students, staff, guardians), `TenantMembership.deactivatedAt`, and the enrolment statuses `ACTIVE`, `PROMOTED`, `REPEATED`, `WITHDRAWN`, `TRANSFERRED`, `ALUMNI`.

## 2. What is the same, and what is not (read from the code on 2026-11-04)
Same (see AlEemaan's 0045 for the reasoning): the states (a pupil `ACTIVE`, `SUSPENDED` until a day or until lifted, `EXPELLED`; staff `ACTIVE`, `SUSPENDED`, `TERMINATED`), the pure rules (`effectiveStanding`: a suspension applies through its last day inclusive; who may; the reason of 3 to 500 characters), the append-only history, no background job (a pupil's suspension is read as ended; a member's is lifted at their next sign-in), expulsion flips the active enrolment to a new `EXPELLED` value so that everything that selects pupils by active enrolment drops them, a suspension of staff reuses `deactivatedAt` (every reader already treats a deactivated membership as absent), nobody acts on themselves, the last administrator is protected.

Different, on purpose:
1. **Tenant and RLS.** `StandingEvent` has `tenantId`, RLS enabled and forced, and composite foreign keys (ADR 0001). AlEemaan's table has no foreign keys; here the records are never hard-deleted (ADR 0004), so the keys cost nothing and the tenant boundary is enforced by the database. The append-only rule is a database trigger that refuses an update and a delete, in the spirit of ADR 0003 (a rule that must not be bypassed is not left to the services).
2. **One membership per person per school.** There is no "staff suspended in one branch but not another": a membership is one row with an optional campus. So **there is no `scope`**; a suspension or termination is of the membership (and the staff record that names it). A `CAMPUS_ADMIN` acts on memberships of their own campus; a membership with no campus (school-wide) is an `ADMIN`'s alone (ADR 0016).
3. **Who may.** `ADMIN` (school-wide) everything but on themselves; `CAMPUS_ADMIN` suspends and lifts the pupils and staff of their own campus while the switch `standing.campusAdminMaySuspend` is on (the school's value AND the campus's; default on; a campus can only turn it off), never on an `ADMIN` or another `CAMPUS_ADMIN`; expel, terminate and reinstate are the `ADMIN`'s. The last-administrator guard is the existing `hasAnotherActiveAdmin`. The platform administrator has no part in it: school data is not theirs (ADR 0016).
4. **Guardians** are real records, so they can be archived, but they are not given a standing: a guardian's access follows the pupil's.
5. **Pupils and guardians sign in as users here** (roles `STUDENT` and `PARENT`, with `TenantMembership` rows), and the portal routes under `/api/v1/schools/[code]/portal/` (practice, forms) are the surface a standing narrows. Whose pupil a caller may ask about is decided in one place, `getStudentForViewer` in `src/lib/portal/portal-helpers.ts` ("decided here and nowhere else"), and the pupil's own record in `resolveStudentForUser`: both change. An **expelled** pupil is "not found" to themselves (the same answer as an unknown id), and a guardian's approved link to an expelled child still names the child but opens nothing; a **suspended** pupil can sign in and read but cannot start a practice session or hand in a form or paper (the routes that write). A standing only ever narrows. Guardians of an expelled child keep whatever finance view exists once there is one (there is no guardian invoice view in this repo yet). The exact list of portal routes to narrow is read from the code when this is built.
6. **Enrolment is per session** (ADR 0009): reinstating flips the expelled enrolment back to `ACTIVE` only in the running session. Where each module selects pupils (attendance, invoice generation, result sheets, promotion) must be re-read in this repo before building; AlEemaan's list is the checklist, not the answer.
7. **The settings store** for the switch is the generic table that task 0027 adds (P0).

## 3. Work breakdown
- [ ] S1 Migration (enums, `EXPELLED` on `EnrollmentStatus`, `standing` and `standingUntil` on students, staff records and memberships with the checks, `StandingEvent` with RLS, composite keys and the trigger); the pure rules; the pupil service and routes; the Students page
- [ ] S2 The staff service (suspend, lift, terminate, reinstate), the sign-in lift, routes; the Users page and the staff list; Reactivate and Restore refuse a suspended or terminated person
- [ ] S3 The campus switch and its Settings tab; walkthrough rows; docs
- [ ] Tests: unit (rules), API (who may, every effect, the history, the guards, campus isolation), integration (the checks, the trigger, RLS), browser (both themes, phone), the route-role-guard source test

## 4. Not in this task
Messages to guardians about a suspension, an appeal process, reporting by period; the same exclusions as AlEemaan's 0045.
