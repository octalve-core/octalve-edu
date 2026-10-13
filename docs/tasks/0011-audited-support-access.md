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
### Slice C: areas declared on every school GET route + the source-level area guard
### Slice D: UI - the school's Support access page (grant dialog, list, what was looked at), the platform page's "Open support view", the read-only banner; e2e + axe in both themes
### Slice E: docs, full suite, PR

## 4. Verification
Recorded per slice. Mutation passes: NOT RUN - pending, end of Phase 2.
