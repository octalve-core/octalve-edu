# [0011]: Audited support access (build of ADR 0017)

- **Period / Focus:** 2026-10-13 to (open) - the SCHOOL grants a platform administrator a read-only, time-limited, area-scoped view; audited on both sides; no RLS bypass
- **Status:** In Progress - slice A built and committed; slices B-E not started
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/support-access-build` -> octalve-core `dev`
- **Started:** 2026-10-13 UTC
- **Ended:** -
- **Duration:** -

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
A school `ADMIN` can grant support access (areas, duration, reason) and revoke it; a platform administrator with a live grant can open a read-only support view of the granted areas; every request is audited in the school's log and the platform's log; nothing else changes about tenant isolation.

## 2. Context & Related Docs
- ADR 0017 (Accepted), plan "Build design - audited support access", ADR 0016. Decisions of 2026-10-13: areas settings / academics / people / attendance / results (finance NOT grantable); 4 h default, 24 h maximum; no break-glass.
- **How the session is represented (decided while building; the design said "a virtual SUPPORT role"):** NOT a new `Role` value. A support session resolves to the school's tenant context with `role: ADMIN` **plus** `support: { grantId, areas, expiresAt }`; `withAuth` then refuses every non-safe method, every route with no declared `area`, and every area outside the grant, so services that branch on role give admin-level READS (the support view must show what an administrator sees) and writes are impossible. Pages go through the same check (`requireTenantPage` takes the area). Reason: no change to the `Role` enum and its exhaustive uses; the cost is that safety rests on `withAuth` / `requireTenantPage` and the source-level area guard, which is what the guard test is for.
- A support session is opened by the platform administrator with their password; it is recorded on the sign-in session (`supportTenantId`, `supportOpenedAt`) and ends at the earlier of the grant's expiry and one hour after opening.

## 3. Work Breakdown
### Slice A: grants (the school's side)
- [x] tests: `tests/integration/support-grants.spec.ts` (RLS, CHECKs, revoke-only trigger, area list in step with the CHECK, `platform_support_grants()`), `tests/api/support-grants.spec.ts` (who may use them, step-up, defaults/limits, audit, isolation). NOT seen failing first: the integration spec was written with the migration, the API spec before the code but not run before it
- [x] migration `20261024090000_support_grants` (additive; applied only to the lane-1 test DB so far - run `pnpm exec prisma migrate deploy` on the dev DB), model `SupportGrant`, `lib/support/{areas,grants}.ts`, routes `GET/POST support-grants`, `POST support-grants/[id]/revoke`. Deviation from the design: a grant is open to ANY platform administrator (a named grantee is refused for now)
- Result: 20 passed (integration + API + route-role guard) after `pnpm build`; typecheck, lint clean. NOT run: the full suite
### Slice B: the session (the platform's side) - resolver, `withAuth` area rule, `requireTenantPage` area, open/close endpoints, audit rows both sides
- [x] migration `20261024100000_support_session` (additive; applied to the dev DB): `Session.supportTenantId` / `supportOpenedAt` (both or neither, FK to the school, SET NULL) and `platform_support_record(tenant, grant, action, detail)` - proves the grant is live for the caller, then writes the school's AuditLog row (in that school's context, restored after) AND the PlatformAuditLog row; returns false and writes nothing when not live
- [x] `lib/support/session.ts` (`liveSupportView`, `recordSupport`, `openSupport`, `closeSupport`, `listOpenableSchools`); `resolveTenant` falls to a support context ONLY when the person has no membership; `withAuth({ area })` refuses (the one 403) a non-GET, a missing area, an area outside the grant, or a request the database cannot tie to a live grant, and records every allowed one; `requireTenantPage(code, area?)` does the same for pages (it records the page as `/schools/<code>` + area - the real path is not known there)
- [x] routes: `POST platform/support/open` ({code, password}; one 404 for every reason it cannot be), `POST platform/support/close` (no password), `GET platform/support/grants`
- [x] tests: `tests/api/support-session.spec.ts` (10): opening, read-only + granted areas only, both logs, per-sign-in, revoke, one-hour cap, close, openable list. NOT seen failing first (written after the code)
### Slice C: areas declared on every school GET route + the source-level area guard
- [x] `area` declared on 31 school GET handlers (academics 12 incl. timetable, people 11, attendance 3, settings 3, results 2); the other 8 of the 39 GET files are out of reach on purpose and listed with reasons in the guard: finance (4 routes), announcements (2), support-grants, the student export
- [x] `tests/unit/route-area-guard.spec.ts` (2): every school GET declares a valid area or is on the out-of-reach list; no state-changing handler declares one. **Seen failing** once: with `area` removed from `members/route.ts` the first test failed naming the route; restored
- Result of B+C: 33 passed (support-session 10, support-grants API 5 + integration 6, area guard 2, route-role guard 9, ...) after `pnpm build`; typecheck, lint, prettier clean. NOT run: the full suite, the existing e2e/API suites against the changed `resolveTenant` / `withAuth` / `requireTenantPage`
### Slice D: UI - the school's Support access page (grant dialog, list, what was looked at), the platform page's "Open support view", the read-only banner; e2e + axe in both themes
### Slice E: docs, full suite, PR

## 4. Verification
Recorded per slice. Mutation passes: NOT RUN - pending, end of Phase 2.
