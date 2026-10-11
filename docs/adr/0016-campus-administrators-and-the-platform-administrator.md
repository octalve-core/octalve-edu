# 0016 — Campus administrators run one campus; a platform administrator runs schools, not their data

Status: Proposed
Decided by: <the maintainer — to accept or modify> · Date: 2026-10-11 (answers C1–C5 given in the session)
Recorded: 2026-10-11

## Context

Until now a school had one kind of administrator (`ADMIN`) who could do everything in every campus, and the platform had nobody above the schools: schools were made by the setup wizard or by hand. Two needs came up: a school with several campuses wants someone who runs **one** campus (its people, classes, attendance, announcements, timetable and its fees) without being able to touch the rest of the school; and the platform needs somebody who can **list, create, suspend and re-type schools** without being able to read any school's data. Tenant isolation is row-level security (ADR 0001); a platform role must not become a way round it. The maintainer answered the design questions on 2026-10-11 (task 0009).

## Decision

- **A campus administrator is a role value, `CAMPUS_ADMIN`, with a campus required** (a database CHECK). `ADMIN` is unchanged and stays school-wide; existing rows are untouched.
- **A campus administrator acts on their own campus only.** The helper `canAdminister` and the route helpers in `lib/auth/campus-scope.ts` give the same answers everywhere: a row of **another campus or an unknown id is a 404**; a **school-wide row (no campus) is a 403** (money records and the Users page treat it as a 404 — not theirs to see); a **new row defaults to their campus** and cannot be put anywhere else.
- **A campus administrator may not** make or change an `ADMIN` or another `CAMPUS_ADMIN`, grant permissions, move anyone to another campus or the whole school, change school settings or campuses, configure fees (structures, discounts, invoice generation), or touch subjects, grade scales, assessment schemes or results. They **may** record manual payments and see their campus's students' invoices. The last-`ADMIN` rule counts `ADMIN` only.
- **The rules sit in the services where a route could forget them** (members, invitations, invoices, announcements); route helpers cover the rest, and a source test (`tests/unit/route-role-guard.spec.ts`) fails a route that lets a campus administrator write without asking about the campus.
- **The platform administrator is a flag on the person, `User.isPlatformAdmin`, set only by an operator script** (`pnpm platform-admin:make`). They use **narrow `SECURITY DEFINER` functions** (`platform_*`) that re-check the flag inside the database and write the platform's own audit log; there is **no bypass of the `app_user` policies and no "act as a school" mode**. They see identity data only (code, name, type, dates, suspended) — no member counts. Every platform request needs **two-step verification on** and every **change** needs the password again.
- **A suspended school simply cannot be used**: its members get the same refusal as a stranger and it leaves their list; nothing is deleted. A school's type changes only through the platform and only before it has any academic period (ADR 0010).

## Alternatives Considered

- **Campus administrator as a flag on `ADMIN` + `campusId`:** silently demotes every existing administrator who was given a campus, and two columns could disagree.
- **A platform role that reads across schools (BYPASSRLS or a "view as" mode):** makes the tenant boundary only as strong as that role; the maintainer wants audited support access later, designed separately.
- **Member counts on the platform list:** needs a cross-tenant read, which is the bypass above.
- **Checks only in routes:** 81 route files name `ADMIN`; one forgotten check is one privilege escalation, so people and money rules live in services too.

## Consequences

- Every route that lets a campus administrator write carries a campus check; adding one means adding the helper and a test.
- A parent or student with no campus on their membership is invisible to a campus administrator on the Users page (they are reached through their linked student).
- A first-administrator invitation cannot be re-sent from the platform page (it would need a look inside the school). **Open question for the maintainer.**
- **Revisit if:** audited support access is wanted (its own ADR), a campus administrator needs school-wide reports, or the Academic setup page gets editing controls for them (the API already allows it).

## Enforced by

`tests/unit/route-role-guard.spec.ts` (every handler declares who may call it; a campus-writing handler asks about the campus; the platform routes call the guard), `tests/api/campus-admin-{people,academics,finance,users}.spec.ts` and `tests/api/platform.spec.ts` (the matrix over real HTTP), `tests/integration/platform.spec.ts` (the CHECK, the `platform_*` functions, a platform administrator reads no tenant table), `tests/unit/administer.spec.ts`.

## Binds

- `src/lib/auth/administer.ts`, `src/lib/auth/campus-scope.ts`
- `src/lib/members/service.ts`, `src/lib/invitations/service.ts`, `src/lib/finance/service.ts`
- `src/lib/platform/`, `src/app/api/v1/platform/`, `scripts/make-platform-admin.mjs`
- `prisma/migrations/20261022090000_campus_admin_role/`, `prisma/migrations/20261022090100_campus_admin_and_platform/`
