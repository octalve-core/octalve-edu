# 0017 — A platform administrator sees a school's data only when the school grants it: read-only, time-limited, scoped and audited

Status: Proposed
Decided by: <the maintainer — to accept or modify> · Date: —
Recorded: 2026-10-13 (drafted by an agent; the maintainer asked for audited support access "later, design first" on 2026-10-11)

## Context

ADR 0016 gave the platform administrator the schools, four counters and the audit log — and **no school data at all**, with no "act as a school" mode. Support will still sometimes need to look: a head teacher says "my timetable looks wrong", a payment does not show. Today the only ways are asking the school to screen-share or reading the database, and the second is outside every control this system has. The design must keep what ADR 0016 protects: tenant isolation is row-level security, and a platform role must never become a way round it or a standing key to every school.

## Decision

- **The school grants access; the platform cannot take it.** A school `ADMIN` (not a campus administrator) creates a **support grant**: who (a named platform administrator, or any), **which areas** (a checklist: settings, academics, people, attendance, results, finance — none ticked by default), **how long** (default 4 hours, at most 24, never open-ended), and a **reason** (a ticket or sentence). The grant is a row in the school's own data (`SupportGrant`, under the school's row-level security), so the school sees it and can **revoke it at any moment**. A platform administrator cannot create, extend or widen one.
- **While a grant is live the platform administrator gets a read-only view of the granted areas through the school's own screens**, as a virtual `SUPPORT` role in the tenant resolver: only `GET` requests, only routes whose declared area is in the grant, every other request is refused with the same 403 a stranger gets. Reads still run under the school's tenant context and its row-level security (the app sets it after verifying the grant, as for any member) — **there is no BYPASSRLS and no database role change**. Secrets are never in any response (password hashes, MFA secrets, tokens are not selected by any route today; a test keeps it so).
- **Every request is audited on both sides**: a row in the school's `AuditLog` (`SUPPORT_ACCESS`: who, route, area, time — never bodies or query values) and one in the platform's `PlatformAuditLog`. The school's administrators have a **Support access** page listing grants (live, expired, revoked) and what was looked at. Creating and revoking a grant are audited too.
- **The platform administrator needs the same step-up as for any platform change** (two-step verification on, the password re-typed to open a support session) and sees a persistent **"Support view of <school> — read-only, expires <time>"** banner. A suspended school cannot be entered.
- **Never writes.** There is no grant that allows a change; a platform administrator who must change something asks the school's administrator to. Revisit separately, as its own ADR, if that proves impossible.
- **A school with no active administrator cannot grant.** That case is the first-administrator re-invite of ADR 0016's amendment, not support access.
- **Each route declares its area.** A source-level test (like the route-role guard) fails a school route that declares no area, so a new feature cannot be reachable in a support view by accident.

## Alternatives Considered

- **A platform role with BYPASSRLS, or a "view as any school" mode:** the tenant boundary becomes only as strong as that role and its credentials; one stolen platform login reads every school. Rejected, as in ADR 0016.
- **The platform administrator requests, the school approves:** the same result with an extra step and a state machine; a school-initiated grant is simpler and the school stays in control. A request button can be added later.
- **Break-glass (platform access without the school, with a second platform administrator approving):** needed only if a school can be neither asked nor re-invited; the maintainer can choose to add it later, with its own ADR.
- **Screen-sharing only:** no audit, no scoping, and the school's data on a stranger's screen anyway.
- **Writes under a grant:** the audit trail would then have to explain changes made by someone outside the school; refused.

## Consequences

- Cost: one table, a resolver branch, a source-level area map for every school route (about 110 route files get one line each), a Support access page for school administrators and a support-session entry on the platform page.
- A grant can only be as granular as the areas; a school that wants "just this one student" cannot say so.
- The audit rows record routes and ids in the URL, not what was displayed; the school can see what was reachable, not what was read.
- **Revisit if:** support needs to change data; a school cannot be asked (add break-glass); areas are too coarse; or a regulator wants access logs retained beyond the audit log's retention.

## Enforced by

(planned, task 0011) integration: a `SUPPORT` request with no grant, an expired or revoked grant, a grant for another school or another area, any non-GET, and a suspended school are each refused; a granted area reads through row-level security only (a platform administrator still reads nothing else); every request writes both audit rows; a campus administrator and a teacher cannot create a grant. Source-level: every school route declares an area. e2e (+ axe, both themes): the grant dialog, the Support access page, the support banner.

## Binds

- (planned) `prisma/migrations/…_support_grants/`, `src/lib/support/`, `src/lib/tenant/resolve-tenant.ts`, `src/lib/auth/with-auth.ts`, `tests/unit/route-area-guard.spec.ts`
