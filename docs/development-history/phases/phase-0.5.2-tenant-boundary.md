# Phase 0.5.2 — Tenant trust boundary: the application layer

**Status: APPLICATION LAYER BUILT AND VERIFIED (2026-10-05); ROW-LEVEL SECURITY NOT BUILT — blocked on a database role.**
Branch `claude/tenant-trust-boundary` (based on `claude/account-self-service`). Design of record: plan §0.5.2 and "Build design for
§0.5.2" (written before any code). Roadmap position: `roadmap-breakdown.md` §0.5.2-A…H. **This is not the finished phase:** the
database half (RLS policies, the `app_user` runtime role, the "suite runs as `app_user`" harness, the catalog guard) is written down
and waiting; see "What is not done".

## What this delivers
The URL's `[code]` is a **lookup key, never a claim**. A request becomes "acting for school X" only after the signed-in person's
*own* membership in X has been found; nothing else produces the branded `VerifiedTenantId` that tenant data access demands.
- **`lib/tenant/verified-tenant.ts`** — `VerifiedTenantId` (a branded string; a raw string does not compile — proved by
  `@ts-expect-error` lines in `with-auth.types.ts`) and its one constructor `trustedTenantId()`. ESLint confines it, and the raw
  `prisma` client, **out of** `src/app/schools/**` and `src/app/api/v1/schools/**` (and a unit test lints virtual files at those paths
  to show the rule fires).
- **`lib/tenant/for-tenant.ts`** — `forTenant(id).transaction(fn)` / `forUser(id).transaction(fn)`: ONE interactive transaction, the
  context set first with `set_config(name, $1, true)` — a bind parameter (an id full of SQL stays a string) and **transaction-local**
  (proved on a one-connection pool: nothing leaks to the next transaction or query). `setTenantContext` for code that creates a tenant
  and its first rows atomically.
- **`lib/tenant/resolve-tenant.ts`** — validate the code → (Solo: assert exactly one tenant, else **500 fail closed**, and match the URL
  code against it) → look up the caller's membership (SaaS: in the tenant with that code; Solo: in the install's one tenant **by id**)
  through the user context. **Unknown, malformed and "not a member" are one 403.** An ADMIN of school A is not an admin of school B; a
  person in two schools gets each school's own role.
- **`withAuth(handler, { tenant: true, roles })`** — resolves the school from `params.code`, passes `auth.tenant` (verified id, code, name,
  role, campus, `run(fn)`); `roles` is checked against the role **in that school** (never "any membership"); a role that isn't allowed
  gets the *same* 403 body as no access; `roles` without `tenant: true` is a type error and a throw; `permissions` stays unavailable
  until §1.7. CSRF and 401 run before any tenant is looked up, so a signed-out probe learns nothing about which schools exist.
- **Existing code moved onto contexts:** `auditPersonEvent` (one row per school, each in its own tenant context), `getUserMemberships`
  and `completeSignIn`'s admin check (user context), the setup wizard (tenant context set in its own transaction), `scripts/mfa-reset.mjs`.
- **Routes and pages:** `GET /api/v1/schools/[code]` (role + the campuses that role may see; the query is scoped to the tenant **and** runs
  in the tenant context — belt and braces); `/schools/[code]` workspace; a real **HTTP 403** view (`forbidden()`, `experimental.authInterrupts`)
  that names nothing; **`/dashboard` is now the front door** — one school redirects in, several get a picker, none get an honest message.
- **Test harness:** a **fifth server in `DEPLOYMENT_MODE=saas`** (`SAAS_PORT` 3103) because the Solo servers rightly fail closed when a second
  tenant exists; `createTenant` / `addMembership` / `removeCreatedTenants`; a shared `withEnv`.

## Verification
`pnpm test`: **811 passed, 5 skipped by design, 0 failed** (17.4 min; it was 740) — unit 123, integration 161, api 253, e2e-desktop 135
(+1 skipped), e2e-mobile 135 (+4), https 8. `tsc`, ESLint, `next build` clean. New: **unit** (withAuth option refusals, lint guards);
**integration** — resolver (member, role per school, all refusals identical, ADMIN-of-A-is-not-admin-of-B, removal takes effect at once,
Solo: one tenant / second tenant → 500 / none → 500 / malformed code stays 403 / membership still required), the `withAuth` wrapper
(roles, role in the wrong school, revoked session, CSRF before tenant, missing params), the context (bind parameter, transaction-local on a
one-connection pool, rollback), audit per school, memberships; **api** — on the SaaS server: roles and campuses, cross-tenant 403 for an admin, a
teacher and a person with no school, **another / unknown / malformed code indistinguishable**, 401 identical for real and unknown codes,
ended session, removed membership, hostile school names as plain JSON, and **every route under `/api/v1/schools/` discovered from the file
system** and hit cross-tenant, signed out and as a person with no school (a route added without the check fails); Solo server — one school,
second tenant → 500 naming nothing; **browser** (desktop + phone) — routing (one / several / none), tampering with the code → 403 view naming
nothing and identical for a real and an unknown school, hostile names inert; axe in both themes + tap targets for picker, workspace (admin,
staff, no campus) and the 403 view. The existing suites were adapted to the front door (`HOME_URL`).

### Mutation testing — 25 injected bugs, all caught or equivalent
The resolver (anyone's membership accepted; "not a member" answering differently; Solo invariant dropped; Solo ignoring the URL code; no
lower-casing; no format check); the context (session-level instead of transaction-local — for tenant and user; context never set; id check
dropped); `withAuth` (roles unchecked; role denial with a different body; tenant resolved before the session; a misconfigured install answered
403); memberships for every user; audit for the first school only; the route (non-admin sees every campus; query unscoped; handler not
wrapped — a **compile error**); the front door (multi-school person redirected; the 403 view naming the school). **Three survivors, all
instructive:** T4 and T6 were real — the Solo URL-code check was *redundant* because the membership lookup matched by code (Solo now looks up by the
tenant's id, which makes the check load-bearing) and the format check had no observable effect (a test now pins that garbage is refused before the
install's state is consulted); W4 (a missing `params` read as the code `"x"`) and T11 (Solo looking the tenant up by code after the code was already
matched) are **equivalent** — same outcome either way.

## Findings and decisions
| # | Found by | What | Resolution |
| :-- | :-- | :-- | :-- |
| 1 | Reading the plan | `TenantMembership` was listed both as RLS-scoped and as an identity table that must be readable before a tenant is known. | One table, a two-path policy (tenant **or** own user to read; tenant only to write) — designed, to be built with RLS. |
| 2 | The front door | Every existing browser test assumed "signed in = `/dashboard`"; a one-school person now lands in their school. | `HOME_URL` helper; the school page keeps a "Welcome, name" heading so the markers stay meaningful. |
| 3 | Harness | A Solo server with two tenants is (correctly) a 500, so multi-school tests cannot share it. | The SaaS-mode server; specs create and remove their own schools. |
| 4 | Mutation T4/T6 | Solo's code check and the format check were observably redundant. | Solo resolves by tenant id; a test pins the ordering. |
| 5 | Design | `forbidden()` is experimental in Next 16. | It gates only the status code and view; the authorization decision is ours. Verified a real 403 in the production build. |

## What is not done (and why)
**Row-level security.** The migration (`ENABLE` + `FORCE` RLS, `USING` + `WITH CHECK`, the helper functions, append-only `AuditLog`), the
`app_user` runtime role and `DIRECT_URL`, the harness running as `app_user`, `assertRlsEnforced()` and the negative tests as `app_user` all need a
Postgres role that does not exist here and **that the environment would not let me create** (creating `app_user` and giving the fixture role
`BYPASSRLS` through the postgres superuser was refused). It needs the maintainer's decision — the exact commands are in the hand-off. Until it
is done the boundary is enforced by the application only; **do not put real tenant data behind it, and do not start Phase 1 tables, which must
ship RLS in the same migration.** Also not done: the app shell, and the Users pages.
