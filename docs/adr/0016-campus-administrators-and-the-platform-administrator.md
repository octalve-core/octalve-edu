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
- **The platform administrator is a flag on the person, `User.isPlatformAdmin`, set only by an operator script** (`pnpm platform-admin:make`). They use **narrow `SECURITY DEFINER` functions** (`platform_*`) that re-check the flag inside the database and write the platform's own audit log; there is **no bypass of the `app_user` policies and no "act as a school" mode**. They see identity data (code, name, type, dates, suspended) and **four coarse counters per school** (active members, active administrators, students, campuses) — never a person, a row or a name. The counters are kept in a table the runtime role cannot read, written by triggers, and read only by a `platform_*` function (amendment 2026-10-11, below). Every platform request needs **two-step verification on** and every **change** needs the password again.
- **A suspended school simply cannot be used**: its members get the same refusal as a stranger and it leaves their list; nothing is deleted. A school's type changes only through the platform and only before it has any academic period (ADR 0010).

## Alternatives Considered

- **Campus administrator as a flag on `ADMIN` + `campusId`:** silently demotes every existing administrator who was given a campus, and two columns could disagree.
- **A platform role that reads across schools (BYPASSRLS or a "view as" mode):** makes the tenant boundary only as strong as that role; the maintainer wants audited support access later, designed separately.
- **Member counts by counting live across schools:** needs the platform function to read every school's tables — the bypass above. (First draft of this ADR refused counts altogether; the maintainer did not accept a platform page that cannot say how big a school is, so counters are kept instead — see the amendment.)
- **A "view as" mode to find a school's administrator:** same bypass; the zero-administrator case is answered by one counter and one authoritative check inside the re-invite function.
- **Checks only in routes:** 81 route files name `ADMIN`; one forgotten check is one privilege escalation, so people and money rules live in services too.

## Consequences

- Every route that lets a campus administrator write carries a campus check; adding one means adding the helper and a test.
- A parent or student with no campus on their membership is invisible to a campus administrator on the Users page (they are reached through their linked student).
- A first-administrator invitation CAN be re-sent (amendment): only for a school with no active `ADMIN`, by the platform page or by an operator script, always audited.
- Every membership, student or campus write now also updates one counter row of its school: concurrent writes to the same school's people serialise on that row for the length of their transaction (a bulk import holds it until it commits). A counter can drift if something writes around the triggers; `tenant_stats_recompute()` repairs it and a test compares both.
- **Revisit if:** audited support access is wanted (its own ADR), a campus administrator needs school-wide reports, or the Academic setup page gets editing controls for them (the API already allows it; planned, task 0010).

## Enforced by

`tests/unit/route-role-guard.spec.ts` (every handler declares who may call it; a campus-writing handler asks about the campus; the platform routes call the guard), `tests/api/campus-admin-{people,academics,finance,users}.spec.ts` and `tests/api/platform.spec.ts` (the matrix over real HTTP), `tests/integration/platform.spec.ts` (the CHECK, the `platform_*` functions, a platform administrator reads no tenant table), `tests/integration/platform-stats.spec.ts` (the counters), `tests/integration/platform-first-admin.spec.ts` and `tests/integration/invite-first-admin-script.spec.ts` (the re-invite), `tests/unit/administer.spec.ts`.

## Binds

- `src/lib/auth/administer.ts`, `src/lib/auth/campus-scope.ts`
- `src/lib/members/service.ts`, `src/lib/invitations/service.ts`, `src/lib/finance/service.ts`
- `src/lib/platform/`, `src/app/api/v1/platform/`, `scripts/make-platform-admin.mjs`, `scripts/invite-first-admin.mjs`
- `prisma/migrations/20261022090000_campus_admin_role/`, `prisma/migrations/20261022090100_campus_admin_and_platform/`, `prisma/migrations/20261023090000_tenant_stats/`, `prisma/migrations/20261023090100_first_admin_invite/`

## Amendment (2026-10-11, same day, still Proposed): counters and the first-administrator re-invite

Written before the code of task 0010 (design commit first). Two things the first draft left open were decided by the maintainer: "member counts are not acceptable without them" and "build both" (a platform action **and** an operator script) for a lost first-administrator invitation.

**Counters.** A table `TenantStats(tenantId, activeMembers, activeAdmins, students, campuses, updatedAt)`, one row per school:
- row-level security on and forced with a policy for the table's owner only, so the runtime role (`app_user`) can neither read nor write it — one school cannot read another's, nor its own, counters;
- kept by `SECURITY DEFINER` triggers on `TenantMembership` (active = `deactivatedAt IS NULL`; administrators = role `ADMIN`), `StudentRecord` (live = `archivedAt IS NULL`) and `Campus`: each applies the change as "minus what the old row counted, plus what the new row counts", so insert, update and delete all work, and it never inserts a counter row for a school that is being deleted;
- filled for existing schools by the migration (a one-off recount per school with that school's context set) — additive, no existing row changes;
- repaired by `tenant_stats_recompute(tenant)` (not callable through the platform page); an integration test checks the triggers against a live recount after a mix of writes;
- exposed through a **new** function `platform_school_stats()` (admin check inside, no names, no ids but the school's). `platform_list_schools()` is unchanged, so a deployment where the code is older than the migration keeps working (migrations run first).
The numbers are coarse and may be momentarily behind a transaction in flight; they decide nothing — the one decision they inform (is there an administrator?) is re-checked live inside the function that acts.

**Re-invite the first administrator.** `platform_authorize_first_admin_invite(tenant, email)`: checks the caller is a platform administrator, sets that school's context for one statement, counts its active `ADMIN`s and **refuses (`platform_school_has_admin`) unless there are none** — the same "one read inside the school" pattern `platform_set_school_type` already uses for academic periods — then writes the platform audit row (with the address) and returns. In the same transaction the application revokes the school's open `ADMIN` invitations, creates the new one (7 days, hash only stored) and writes the school's own audit rows (`INVITATION_REVOKED`, `INVITATION_CREATED`), so both logs record it. The password is required and the same change rate limit applies; the mail is sent after the response, like every invitation. A person who then accepts becomes the school's `ADMIN`; the platform administrator gains nothing inside the school. Risk accepted and recorded: a platform administrator can choose the address, so they can make themselves the first administrator of a school with none — which is why it is refused for any school that has an administrator and why the platform log names the actor and the address.

**Operator script** `pnpm platform-admin:invite-first-admin -- <school-code> <email> --as <platform-administrator-email>`: the same rule and the same two audit rows, run on the server with the migrator's connection for when the application cannot be used; it prints the invitation link instead of mailing it, and **requires `--as`** so the platform log always names a real platform administrator (no anonymous operator rows).

**Not decided here:** audited support access (still its own ADR, design first).
