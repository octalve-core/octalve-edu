# Octalve Edu — Domain Implementation: Full Step-by-Step Plan

> Companion to `docs/development-history/octalve_edu_progress.md` (what's actually built,
> verified against the real repo) and `docs/development-history/phases/*.md` (one detailed doc
> per completed phase). Mirrors the structure and rigor of `TheNiche`'s own
> `docs/development-history/domain-api-implementation-plan.md`, adapted to Octalve Edu's actual
> domains (school administration, not e-commerce/LMS-as-a-product). Every model and rule below is
> cross-checked against `docs/PRD.md`'s numbered sections and the Security & Compliance Audit tab
> of the same doc — cited inline as `(PRD §N)` or `(Audit #N)` so this plan doesn't drift from the
> documents it's derived from.

## Context

Unlike a from-scratch product with no prior art, Octalve Edu's requirements were stress-tested
twice before any schema was written: once through an ordinary requirements pass (`docs/PRD.md`
§1–§14), and a second time through an adversarial security/compliance audit (the same Claude Doc's
Security & Compliance Audit tab, cross-checked against a second, independently-produced audit).
Several schema decisions below exist *specifically* to close a finding from that audit, not from
the PRD's feature list alone — those are called out explicitly, because they're easy to lose track
of once the code exists and the audit document doesn't.

**What's already real, verified against the actual repo (not assumed):**

1. **Phase 0 is done** — see `docs/development-history/phases/phase-0-foundation.md` for the full
   record. Summary: Next.js 16 (App Router) + TypeScript + Tailwind scaffold, Prisma 6.19 +
   PostgreSQL with Auth.js's required tables plus `Tenant`/`Campus`/`TenantMembership` (the
   verified-membership table the tenant-trust-boundary check reads), a `tier-manifest.json`
   skeleton, and a local-dev `docker-compose.yml`. `pnpm build` is clean, first migration applied
   against a real local Postgres.
2. **No domain schema exists yet.** Every model in Phase 0.5 onward below is new.
3. **No auth wiring, RLS policies, or API routes exist yet**, despite Phase 0's schema already
   having the tables Auth.js needs — the schema existing is not the same as the auth flow being
   built. That's Phase 0.5, sequenced first for exactly this reason.

This document sequences Phase 0.5 onward. Phase 0 is included only as a retrospective pointer, not
as a step to execute.

---

## Phase 0.5 — Auth, RLS & Shared API Infrastructure

Nothing in Phase 1 onward is safe to build on top of until this phase closes the two Critical
findings from the security audit that are architectural, not feature-level: the tenant-trust
boundary and session revocability. Both are infrastructure, not "a school feature," which is why
they're their own phase rather than folded into Phase 1.

### 0.5.0 — First-run superadmin setup wizard (Solo only) — **Done**, built ahead of the rest of
this phase

PRD §4's onboarding table names this for Solo installs ("Run installer, one-time setup wizard") but
never specifies it — built now, out of sequence relative to 0.5.1–0.5.3 below, because it needed
almost none of that infrastructure (no Auth.js session, no tenant-trust-boundary resolver — it's the
one route that runs *before* either exists) and unblocks manually testing everything after it
without a `prisma db seed` script standing in for a real admin account. Adapted from `proplity`'s
own first-run-setup-wizard implementation (`docs/development-history/phases/first-run-setup-wizard.md`
in that repo), which solves the identical problem — a fresh production database has no admin user —
for a single-tenant app; the adaptation here is entirely about Octalve Edu having a `Tenant` model
that `proplity` doesn't.

- **Solo-only, not a SaaS concept.** SaaS tenants get their own self-serve signup flow later (not
  built yet); this wizard bootstraps the *one* tenant a Solo install ever has. `GET`/`POST
  /api/v1/setup` and the `/setup` page both hard-404 outside `DEPLOYMENT_MODE=solo` — not just a
  UI-level redirect, since the route doing anything at all in SaaS mode would be a bug, not a choice.
- **Schema** (retrofit into Phase 0's `schema.prisma`, this migration
  `20260927223904_add_setup_wizard`): `User.passwordHash String?` (the same field 0.5.1 below
  already planned to add — done here instead since this route needed it first); a `SystemSettings`
  singleton (`id = "global"`, `setupComplete Boolean`) — proplity's exact pattern, since Octalve
  Edu's own `Tenant` table can't answer "is setup done" by itself without a race (two concurrent
  requests both seeing zero tenants); `AuditLog` brought forward from Phase 1's design (§1.5 below)
  because this wizard needed a real audit trail same as everything after it will.
- **API** (`src/app/api/v1/setup/route.ts`): `GET` returns `{ setupComplete, requiresToken }`;
  `POST` guarded by CSRF (`lib/auth/csrf.ts`), IP rate limiting (`lib/auth/rate-limit.ts` —
  in-memory, deliberately not the real `LoginAttempt`-backed limiter 0.5.1 will build for login,
  since Solo always runs as one long-lived process, never serverless), Zod validation, an optional
  `SETUP_TOKEN` compared with `crypto.timingSafeEqual`, and the same atomic-conditional-update
  transaction as `proplity` (`systemSettings.updateMany({ where: { setupComplete: false }, ... })` —
  `count === 0` means someone else's request already won the race). On success, creates the `Tenant`
  (code auto-derived from the school name via `lib/tenant/validate-code.ts`'s slugify + reserved-word
  check — Solo installs never see or choose a code, per PRD §7), the admin `User`, its
  `TenantMembership` (`role: ADMIN`), and an `AuditLog` row, all in one transaction. Every response
  uses PRD §7's mandatory `{ data, meta, error }` envelope (`lib/api/envelope.ts`) — the first route
  in the repo to need it, so that's where the shared helper was born.
- **Frontend** (`src/app/setup/`): `page.tsx` is a Server Component, 404s outside Solo, redirects to
  `/login` if `setupComplete` is already true (fails open on a DB error, same reasoning as
  `proplity`'s version — a transient blip shouldn't lock a deployer out of their own bootstrap
  step), otherwise renders `SetupWizardForm.tsx` (school name, admin name/email, password ×2 with a
  live checklist, optional setup-token field). No design-system dependency added for this — Octalve
  Edu has no component library yet, so it's plain Tailwind, not a port of `proplity`'s (which uses
  `lucide-react` icons and `sonner` toasts it already had installed).
- **Verified live, not just built**: `pnpm prisma migrate dev` applied against the real local
  Postgres; `pnpm build` clean; `DEPLOYMENT_MODE=solo pnpm dev` + a real `POST` created a tenant +
  admin + membership + audit row (confirmed via the response body), a second `POST` correctly got
  `409 ALREADY_COMPLETE`, and `GET` reflected `setupComplete: true` afterward; separately,
  `DEPLOYMENT_MODE=saas pnpm dev` confirmed both `/api/v1/setup` and `/setup` return `404`. Test data
  truncated from the local dev database afterward so it starts clean again.
- **Explicitly out of scope**: no email to the new admin (no delivery provider wired up yet, same
  gap `proplity` documents); no Campus/branch creation in the wizard (a Solo school can add
  campuses later via Settings, once that exists); a SaaS-side "platform operator" superadmin concept
  is not built and not requested — this is only ever a single school's first admin.

### 0.5.1 — Auth (revised 2026-09-30, second pass)

**Auth.js's `Credentials` provider is not used at all — this supersedes an earlier draft of this
section that described wiring it.** Auth.js v5 refuses `Credentials` combined with
`session.strategy: "database"` outright (`UnsupportedStrategy`, thrown by its own `assertConfig` on
every request under `/api/auth/*`). AlEemaan (sibling project, identical stack) hit this live and
kept database sessions — the deliberate PRD §7 decision here too — by dropping `Credentials`
entirely (`providers: []`) and hand-rolling login/logout against the same `Session` table Auth.js's
`PrismaAdapter` reads. Same approach here. Auth.js is kept only for its adapter/session-reading
machinery (the exported `auth()` helper) — a materially smaller role than originally planned, worth
noting given the section below on whether to keep it at all.

**Resolved 2026-09-30: hand-roll, mirroring AlEemaan — do not adopt Better Auth.** A research spike
(prompted by the fact below) checked Better Auth against this plan's actual non-negotiable
requirements. Verdict, point by point: database sessions with row-delete revocation fit well
(Better Auth's default, not an opt-in); TOTP MFA fits well (a real first-party `twoFactor` plugin,
worth using as a *reference implementation* later even without adopting the framework); session
listing/revocation fits well. But the one requirement that's actually non-negotiable —
**hashed-session-tokens-at-rest** — is **not shipped**: Better Auth stores the raw token value today,
and a `storeTokenHash` option exists only as an unmerged draft PR
(better-auth/better-auth#11444, tracking issue #11442), not in any released version. Redoing that
exact guarantee inside an unfamiliar library via a custom `databaseHooks` interception would add real
risk for no net gain, when AlEemaan's hand-rolled version already proves the identical guarantee out
in production. Separately, Better Auth's `organization`/`teams` plugin doesn't map as cleanly onto
`Tenant`→`Campus` (optional anchor) as this project's own purpose-built schema — team assignment
lives in a separate join table, not a nullable field on `Member`, so "admin anchored to one campus but
authorized across all of them" isn't a native concept there either. Full reasoning and sourced
citations: ask for the spike's original report if needed, or trust this summary — re-litigating it
without new information isn't necessary. Revisit only if Better Auth's `storeTokenHash` ships and
stabilizes.

**Practical consequence: build §0.5.1 by adapting AlEemaan's already-built, already-verified
implementation, not from scratch.** `AlEemaan/src/lib/auth/session.ts`, `password.ts`, and
`rate-limit.ts` (see that repo's `docs/development-history/phases/phase-0.5.1.5-auth-rebuild.md` for
the full build record) are the working reference for the mechanism described below — hashed session
tokens, timing-safe compare, the fixed rate limiter. Port and adapt for `TenantMembership`/`Campus`
(AlEemaan's `requireAdmin()` → this project's `withAuth()`, `Membership.branchId` →
`TenantMembership.campusId`), don't reinvent the mechanism itself.

**The fact that triggered this spike (found 2026-09-29, via a two-AI cross-review of this plan and
AlEemaan's shipped code — see `docs/auth-review-2026-09-29.md` for the full record): Better Auth's
team took over Auth.js maintenance in September 2025, and Vercel acquired Better Auth in July 2026.
Auth.js is now maintenance-mode — security patches only, no new features — and its own maintainers
now point new projects at Better Auth.** Auth.js's role in this plan was already reduced to "read
`Session` rows via an adapter" even before this decision — and per the resolution above, that role is
now dropped to zero: no Auth.js dependency at all, same as AlEemaan.

#### Login/logout route design

Guard order, same as every other mutating route in this codebase: `validateCSRF(req)` (the helper
already exists, `lib/auth/csrf.ts`, built for the setup wizard) → rate limit (key strategy in §0.5.3)
→ Zod-validate → look up `User` → compare password → create `Session` row → set cookie.

- **Constant-time response, not just a constant-time password compare.** Always run
  `bcrypt.compare` against a fixed dummy hash — generated once at boot, at the real production cost
  factor, never a malformed placeholder (a malformed hash makes bcrypt return instantly, which
  defeats the fix) — even when no user matches the email, or when `passwordHash` is null (an
  invited-but-not-yet-activated user). Both branches must cost the same regardless of outcome;
  verify with a test asserting similar timing across both paths, not just code review.
- **Enumeration-safe error messages** — identical `401 INVALID_CREDENTIALS` for "no such user" and
  "wrong password."
- **Password max length: 128 characters, enforced in the Zod schema at both login and account
  creation.** bcrypt silently truncates at 72 bytes — without a cap, a long passphrase loses
  entropy with no warning, and nothing stops an oversized payload from being submitted.
- **Fresh, server-generated, high-entropy session token on every login, never client-supplied**
  (`crypto.randomBytes(32).toString("hex")`, 256 bits) — the actual defense against session
  fixation. Stated explicitly so a future change can't "simplify" it into accepting or reusing a
  token from anywhere else.
- **Hash the session token before storing it** (SHA-256 is fine — the token itself is already
  256-bit random, so a fast hash doesn't weaken anything). The client keeps the plaintext token in
  its cookie; the database stores only the hash. This is the standard pattern documented by Lucia's
  (no-longer-maintained-as-a-library, but still a correct reference) session guide — a leaked
  database backup or a read-only SQL injection elsewhere in the app then yields no directly-replayable
  session tokens, only hashes. **Resolved: write a small custom `getSession()`, same as AlEemaan's
  `src/lib/auth/session.ts` — Auth.js's Prisma adapter looks sessions up by the raw cookie value and
  can never find a hashed row without being patched, so wrapping it isn't viable. Drop
  `next-auth`/`@auth/prisma-adapter` entirely rather than keep an adapter that no longer does
  anything.**
- **Normalize email (`trim().toLowerCase()`) at every point `User.email` is read or written** — the
  setup wizard, this login route, and any future signup/invite flow. Enforce it at the database
  level too (Postgres `citext` on the column, or a `CHECK (email = lower(email))` constraint) — app-
  code normalization alone doesn't protect against a seed script or direct SQL import bypassing it.
- **Cookie**: `httpOnly`, `sameSite: "lax"`, explicit `cookies.sessionToken.name`. Use the
  **`__Host-` prefix in production, not `__Secure-`** — `__Host-` additionally forces `Path=/` and
  forbids a `Domain` attribute, closing a subdomain-cookie-planting risk `__Secure-` alone doesn't.
  Derive the `secure` flag from the actual configured scheme (an explicit env var or the app's own
  base URL), **not from `NODE_ENV`** — a Solo install genuinely running on `http://` in production
  mode (a LAN deployment with no reverse-proxy TLS yet) would otherwise get a `200` from login with
  no cookie ever set, since browsers silently refuse a `Secure` cookie over plain HTTP. Warn about
  this in the setup wizard if it detects a non-HTTPS base URL in production mode. Add
  `Cache-Control: no-store` on every auth response. Define the session lifetime as **one shared
  constant**, imported by both `src/auth.ts`'s `session.maxAge` and the login route's
  `Session.expires` calculation — never duplicated as a separate literal in each file.
- `POST /api/v1/auth/logout` — `validateCSRF(req)` → delete the `Session` row (match by the hashed
  token, per the hashing note above) → **delete the cookie with the exact same attributes it was set
  with** (`path`, `secure`, `sameSite`, the `__Host-`/`__Secure-` name). A bare `cookies.delete(name)`
  with no attributes can silently fail to clear a `__Host-`/`__Secure-`-prefixed cookie in a real
  HTTPS deployment even though the dev-mode unprefixed cookie clears fine — this needs an actual
  HTTPS end-to-end test before trusting it, not just the dev-mode verification AlEemaan's own logout
  route was checked against.

#### Session lifecycle (not just create/delete)

- **Rotate at login**: if the incoming request already presents a session cookie, delete that
  session row before minting the new one — don't let old and new sessions both stay valid.
- **Cap concurrent sessions per user** (e.g. 10) — evict the oldest on overflow, so a scripted login
  loop can't grow `Session` rows for one account without bound.
- **`revokeUserSessions(userId, { except? })`** — one helper, called on every password change, role
  change, or account deactivation. Without this, a dismissed staff member's session or a password
  reset's *old* session both stay valid until natural expiry (up to 30 days).
- **Absolute lifetime cap, shorter for `ADMIN`**, layered on top of the idle/`maxAge` expiry already
  planned.
- **A nightly purge job** for expired `Session` rows — nothing currently deletes them once `expires`
  passes; Auth.js's adapter just stops honoring them, the rows themselves accumulate forever.
- **Extra `Session` columns needed for the "active devices" UI below to be useful at all**:
  `createdAt`, `lastUsedAt`, `userAgent` — the current `Session` model (`id`, `sessionToken`,
  `userId`, `expires`) has nothing to show a user besides "a session exists." Add these to the
  schema design when this section is actually built, not retrofitted after the UI is written against
  an incomplete model.
- `otplib`-based TOTP for MFA, `mfaSecret String?` (encrypted at rest — PRD §10) and
  `mfaEnabled Boolean @default(false)` on `User`. **The step order matters and needs to be explicit,
  or MFA becomes decorative**: password verification must **not** create a real `Session` row
  directly. Issue a short-lived (~5 minute), single-purpose pending-MFA token that `auth()` cannot
  read as a valid session, and only create the real `Session` row after TOTP verification succeeds
  (recording `mfaVerifiedAt`). Otherwise an attacker who obtains the password alone gets a real,
  usable session the instant they submit it, and the TOTP prompt is just UI theater on top of an
  already-valid session. Rate-limit TOTP attempts separately from login attempts; store recovery
  codes hashed, never plaintext.
- Session revocation surface: a "your active devices" page reading the current user's `Session` rows
  (now with the columns above to actually be useful), with a delete action per row (Audit #23's
  server-revocable-sessions fix) — cheap specifically *because* database sessions were chosen over
  JWT in Phase 0.

#### Rate limiting for the login route specifically

Full shared rate-limiting design lives in §0.5.3; the login-specific requirement: **the bucket
records failed attempts only, not every request** — a correct login must never count against it, or
a naive "generic auth-route-group middleware" implementation ends up locking out someone switching
devices or retrying after a network blip.

### 0.5.2 — Tenant trust boundary (closes Audit's most severe finding)

This is PRD §7's own words, made real:

```
authenticated user → verified tenant membership → SET LOCAL app.tenant_id → RLS
```

- `lib/tenant/resolve-tenant.ts`: given a request and its authenticated session, reads the URL's
  `[code]` segment **only as a lookup key** — resolves it to a `Tenant.id`, then queries
  `TenantMembership` for `(userId, tenantId)`. No membership row → 403, regardless of what the URL
  says. This function's own test suite is the negative-test requirement from Audit #21: change
  `[code]` to a different tenant's code and confirm every protected route rejects it, not just a
  sample. Returns a **branded `VerifiedTenantId` type** (`type VerifiedTenantId = string & { readonly
  __brand: "VerifiedTenantId" }`), not a bare `string` — this is a compile-time guarantee on top of
  the ESLint import restriction below, not instead of it: TypeScript won't accept a raw `req.url`
  substring where a `VerifiedTenantId` is expected, so the mistake the ESLint rule catches at review
  time is also caught by `tsc` before that.
- **`ADMIN` role scoping, resolved explicitly (2026-09-30) rather than left ambiguous**: same rule
  AlEemaan already uses for its own `Membership.branchId` — any `TenantMembership` with `role: ADMIN`
  grants access across every `Campus` under that tenant, regardless of which `campusId` that row
  happens to anchor to (`campusId` is bookkeeping — which campus onboarded them — never a
  restriction). Keeping this identical between the two projects matters now that AlEemaan's own auth
  is being aligned to this plan (see AlEemaan's `domain-implementation-plan.md`) — one authorization
  rule, not two subtly different ones that happen to look similar.
- `lib/tenant/for-tenant.ts`: the `forTenant(tenantId: VerifiedTenantId)` Prisma client extension
  already named in PRD §7 — the parameter type itself is the branded type above, so a caller can't
  pass an unverified string even if they tried. Wraps every query in a transaction that sets the
  tenant context first. **Use `set_config`, not string-interpolated `SET LOCAL`**: `SET LOCAL app.tenant_id
  = '<id>'` requires the value to be lexically part of the SQL string, since `SET LOCAL` doesn't
  accept bind parameters — if any future code path ever calls this with a value that isn't already
  the verified branded type (e.g. someone reaching for `$executeRawUnsafe` directly instead of going
  through `forTenant()`), that's a SQL injection vector in the tenant-isolation safety net itself.
  `set_config()` is a regular function call and *does* accept a bind parameter:
  `await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}::text, true)``. Read it back
  with `current_setting('app.tenant_id', true)` (the `true` "missing OK" argument matters — without
  it, a context where the setting was never set throws instead of returning null, and every RLS
  policy below needs the unset case to mean "return zero rows," not "error").
- **RLS is inert unless the database role connecting actually has it enforced — this needs explicit
  role setup, not just `CREATE POLICY` statements.** Postgres RLS policies do not apply to a table's
  owner, to a role with `BYPASSRLS`, or to a superuser, by default — and Prisma's migration role
  typically *is* the table owner. If the app's runtime `DATABASE_URL` connects as that same owner
  role, every RLS policy silently does nothing, while `CREATE POLICY` succeeds and a naive negative
  test can even pass (because the test also runs as the owner). Required: two distinct Postgres
  roles — a `migrator` role that owns the tables (used only for `prisma migrate`), and a separate
  `app_user` role with `NOBYPASSRLS` and DML-only grants (used by the actual running app's
  `DATABASE_URL`). Add `ALTER TABLE ... FORCE ROW LEVEL SECURITY` on every tenant-scoped table so
  policies apply even to the owner as a second layer. Every policy needs both a `USING` clause (for
  reads) and a `WITH CHECK` clause (for writes) — a `USING`-only policy lets a query *insert* a row
  belonging to a different tenant even though it can never be *read* back.
- RLS policies added in this phase's migration for every tenant-scoped table that exists so far
  (currently: `Campus`, `TenantMembership`). Every table added in Phase 1 onward gets its RLS
  policy in the *same* migration that creates the table — never a follow-up migration, so there's
  no window where a new table exists without RLS.
- **Identity tables queried before any tenant is known, listed explicitly rather than discovered by
  trial and error**: `User`, `Session`, `Tenant`, `TenantMembership` itself. Login and session lookup
  happen before `resolve-tenant.ts` has run — if `TenantMembership` were RLS-filtered the same way
  as tenant-scoped business data, `resolve-tenant.ts` could never read the very row it exists to
  verify (a chicken-and-egg lockout). These identity tables are deliberately **not** RLS-scoped by
  tenant; everything they need protected is protected by ordinary query conditions
  (`WHERE userId = ...`), not RLS. Keep this list reviewed and short — it's the explicit exception
  list to "every tenant-scoped table gets RLS," and it should only ever contain tables that
  structurally can't be tenant-scoped, not tables where RLS was merely inconvenient.
- **Use one interactive transaction per request** (`forTenant(id).$transaction(async (tx) => {...})`
  style), not `forTenant()` re-wrapping each individual query — a per-query wrapper costs a
  round trip per call for something that should be set once per request. Size the connection pool
  with this in mind (each request holds a transaction, not just a query, for its duration); if a
  pooler sits in front of Postgres, it needs to support transaction-scoped session state (PgBouncer's
  transaction-pooling mode does).
- **Cross-tenant identity takeover, closed at the provisioning step, not the auth step**: `User` is
  global (one row per email, across every tenant) while `TenantMembership` is per-tenant — so a
  tenant admin directly setting a password for `teacher@gmail.com` at their school, when that same
  email already belongs to a real person teaching at a *different* school, hands the admin (however
  unintentionally) a working password for someone else's account at another tenant. **Tenant admins
  must only ever send an email invite, never set a password directly for an email address they
  don't already have a verified relationship with.** The invitee proves ownership of the email (a
  time-limited invite-acceptance link) and sets their own password; if that email already has a
  `User` row, the new `TenantMembership` attaches to the existing account only once the invitee
  accepts it while authenticated as themselves, never created silently by the inviting admin alone.
- **`DEPLOYMENT_MODE=solo` needs a runtime invariant, not just a code-path branch.** The current
  design has `resolve-tenant.ts` return the install's one `Tenant` row directly under Solo mode,
  skipping the membership lookup. If that env var were ever mistakenly set on a SaaS deployment (or
  a second `Tenant` row somehow appeared in what's supposed to be a Solo install), this silently
  becomes "every authenticated user gets access to whichever tenant row happens to be first" —  a
  full cross-tenant data leak from a single misconfigured environment variable. Assert, at startup
  and on every request under this code path, that exactly one `Tenant` row actually exists in the
  database — fail closed (500, not silently proceed) if that invariant doesn't hold. The env var
  should only ever change *where the tenant ID comes from*, never skip the membership-verification
  step itself.
- Front-door routing (PRD §7 "URL scheme"): `/dashboard`, `/list/*` resolve the session's active
  tenant and redirect into `/schools/[code]/...` when the user belongs to exactly one tenant; a
  school picker otherwise. Built here because it depends on 0.5.2's membership lookup existing
  first.
- **Keep authorization checks inside route handlers, never in Next.js middleware/`proxy`.** This
  design already does this (every check above lives in `resolve-tenant.ts`/`withAuth`, called from
  handlers) — stated explicitly because CVE-2025-29927 was a real, critical Next.js middleware
  bypass (a spoofed internal header skipped middleware entirely, patched in 15.2.3) affecting any
  app that put authorization logic in middleware. Use `proxy`/middleware for routing and UX only;
  keep a rebuild-and-patch routine for Next.js security advisories regardless.

### 0.5.3 — Shared API infrastructure

Per PRD §7's API-conventions paragraph, built once and reused by every route from Phase 1 onward:

- `lib/api/envelope.ts` — `{ data, meta, error }` response shape, one helper, never constructed
  inline per route.
- `lib/api/pagination.ts` — both offset (`page`/`limit`) and cursor helpers (PRD §7: offset for
  small stable lists, cursor for high-churn ones like `AttendanceRecord`/`AuditLog`).
- `lib/api/validate.ts` — wraps a Zod schema around a route handler; the same schema instance is
  later fed to `zod-openapi` (PRD §7 stack table) for the generated API docs, so validation and
  documentation cannot drift apart.
- `lib/api/rate-limit.ts` — closes Audit finding #14. **Client library correction (2026-09-30):**
  `@upstash/ratelimit`'s default client talks to Upstash's own hosted REST proxy over HTTP, not the
  plain Redis wire protocol — it will not work against a self-hosted `redis:7-alpine` container the
  way `docker-compose.yml` provisions one for local dev, without also running Upstash's separate
  self-hosted REST-proxy shim. Either actually provision Upstash's hosted Redis for this, or use
  `ioredis` (talks the real Redis protocol) with a Lua script for atomic increments, or
  `rate-limiter-flexible` (supports an `ioredis` backend natively) — decide which before this section
  is built, since the plan currently names a library that doesn't fit the infrastructure already
  provisioned.
  - **Layered keys, not a single key** — the earlier "key on `ip + email` combined" note was a real
    improvement over IP-only but still leaves two gaps open on its own: one IP spraying one common
    password across *every* account never trips an `ip+email` limit (each combination is fresh), and
    a botnet hitting *one* account from many IPs never trips it either (each IP's own count stays
    low). Use three limits together: per-IP across all accounts (stops spraying), per-`ip+email`
    (stops a single attacker grinding one account), and per-account across all IPs (stops distributed
    credential stuffing). Make the per-account limit a *soft* response — a delay, a CAPTCHA, a
    "someone tried to sign in" email notice — rather than a hard lockout, so an attacker can't
    weaponize the limit itself to lock a real user out.
  - **Atomic reserve, not check-then-record.** The current AlEemaan-derived pattern checks the limit
    *before* the slow async work (JSON parse, DB lookup, `bcrypt.compare`) and only records the
    attempt *after* — concurrent requests can all pass the check before any of them records anything,
    letting an attacker fire many parallel guesses through in one window regardless of the configured
    limit. Reserve the attempt atomically at the very start of the handler (a Redis `INCR`+`EXPIRE`,
    or a Lua script bundling check-and-increment into one round trip), before any `await` — and
    refund/clear it on a successful login, consistent with "failures only" above.
- `withAuth(handler, { roles })` — checks the resolved tenant membership's `role` against an
  allow-list, `.some()`-style if a user can ever hold more than one role in the future (not true
  today per PRD §7's Role enum, but this guards against the same class of bug TheNiche's own
  migration plan flagged: don't write `.includes()` against a value that might become an array
  later without noticing). **CSRF is enforced inside this wrapper for every non-`GET` route**, not
  left as a per-route opt-in call — a single forgotten `validateCSRF()` call in one route is a real
  gap in a per-route-call design, and in a multi-tenant app sharing one origin across every school, a
  stored-XSS payload in any one tenant's user-generated content (rich text, an uploaded SVG) could
  otherwise ride a logged-in session across tenants. Supplement with a `Sec-Fetch-Site` header check
  as a second signal, only trust `x-forwarded-host` when the reverse proxy itself sets it (not a
  client-suppliable header), and keep uploaded user content on a separate, cookieless domain with
  `X-Content-Type-Options: nosniff` so it can't execute as same-origin script even if a sanitizer
  gap lets something through.
- **Missing controls, worth planning now rather than discovering as a gap later**: no
  password-reset/forgot-password flow, no minimum-password-length or breached-password check (a
  HaveIBeenPwned-style k-anonymity check at account-creation/reset time), and no audit logging of
  auth events specifically (logins, failures, resets, role changes, session revocations) beyond the
  general `AuditLog` model already in the schema. Password reset needs the same care as login:
  hashed single-use short-lived tokens, a uniform response regardless of whether the email exists,
  rate limiting, and `revokeUserSessions()` (§0.5.1) called on completion so a compromised-password
  reset can't be silently followed by the attacker's own still-valid old session.

**Verification for this phase, before Phase 1 starts:** a negative-test file exercising every item
above — wrong tenant in the URL, no membership, session revoked mid-request, malformed pagination
params, rate limit exceeded — passes in CI, **run as the `app_user` role** (§0.5.2), not the
migration-owner role — a negative test that runs with `BYPASSRLS`-equivalent privileges passes
vacuously regardless of whether the RLS policies actually filter anything. This is the one phase
where "the code compiles" is not sufficient evidence of done; per Audit finding #21,
RLS-looking-correct and RLS-being-correct are different claims until a real cross-tenant test fails
when it should.

---

## Phase 1 — MVP: Core SIS + Finance

Matches PRD §5/§6's MVP scope exactly. Two new schema files, `prisma/schema/sis.prisma` and
`prisma/schema/finance.prisma` (multi-file schema mode, same convention `ims` uses).

### 1.1 — Retrofit into Phase 0's `Tenant`

```prisma
enum SchoolType {
  K12
  HIGHER_ED
  VOCATIONAL
}
```

Add `schoolType SchoolType` to `Tenant` — decides whether `AcademicPeriod` below means "term"
(K12), "semester" (HIGHER_ED), or "cohort with no fixed calendar" (VOCATIONAL), per PRD §3's
decision to support all three school types from day one.

### 1.2 — `sis.prisma`

**`AcademicSession` / `AcademicPeriod` — two levels, not one flat "Term" table.**

```prisma
model AcademicSession {
  id        String   @id @default(cuid())
  tenantId  String
  label     String            // "2026/2027"
  startDate DateTime
  endDate   DateTime
  isCurrent Boolean  @default(false)

  tenant Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  terms  AcademicPeriod[]

  @@index([tenantId])
}

enum PeriodKind {
  TERM      // K12: 1st/2nd/3rd term
  SEMESTER  // HIGHER_ED
  COHORT    // VOCATIONAL: a running cohort, no fixed term boundary
}

model AcademicPeriod {
  id        String     @id @default(cuid())
  tenantId  String
  sessionId String
  kind      PeriodKind
  label     String     // "1st Term", "Semester 1", "Cohort — Jan 2027 Intake"
  startDate DateTime
  endDate   DateTime?  // nullable for COHORT — no fixed end at creation
  isCurrent Boolean    @default(false)

  tenant  Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  session AcademicSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([sessionId])
}
```

**Why two levels (Decision, PRD §14):** the billing-cycle setting (per-term vs. per-session) has to
bill against *either* a whole session or one period — `Invoice.periodId` needs a foreign key that's
meaningful at both grains, which a single flat table can't give without picking one grain up front
and being wrong for the other setting value.

**`ClassGroup` / `ClassArm` — capacity lives on the arm, not the group.**

```prisma
model ClassGroup {
  id       String @id @default(cuid())
  tenantId String
  campusId String?
  name     String  // "JSS1", "Year 10", "Cohort A"

  tenant Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  campus Campus?    @relation(fields: [campusId], references: [id], onDelete: SetNull)
  arms   ClassArm[]

  @@index([tenantId])
}

model ClassArm {
  id           String @id @default(cuid())
  classGroupId String
  name         String // "A", "B"
  capacity     Int?   // null = uncapped

  classGroup  ClassGroup          @relation(fields: [classGroupId], references: [id], onDelete: Cascade)
  enrollments StudentEnrollment[]

  @@index([classGroupId])
}
```

**Why (Decision, PRD §5/§14 "class capacity/streaming — manual for MVP, Settings-ready"):**
"JSS1 is full" isn't a real statement — "JSS1-A is full" is. Putting `capacity` on the arm now
means the future auto-assign-on-capacity feature needs zero schema migration when it ships; MVP
just never reads the field for automation, only for display.

**`Subject`, `StaffRecord`, `StaffSubjectAssignment` — staff record ≠ staff account.**

```prisma
enum StaffCategory {
  TEACHING
  NON_TEACHING
}

model Subject {
  id       String @id @default(cuid())
  tenantId String
  name     String
  code     String?

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
}

model StaffRecord {
  id        String        @id @default(cuid())
  tenantId  String
  campusId  String?
  userId    String?       @unique  // nullable — a record does not require an account (PRD §5/§7)
  category  StaffCategory
  firstName String
  lastName  String
  phone     String?
  email     String?
  isActive  Boolean       @default(true)

  tenant Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  campus Campus? @relation(fields: [campusId], references: [id], onDelete: SetNull)
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)

  subjectAssignments StaffSubjectAssignment[]

  @@index([tenantId])
}

model StaffSubjectAssignment {
  id            String @id @default(cuid())
  staffRecordId String
  subjectId     String
  classArmId    String

  staffRecord StaffRecord @relation(fields: [staffRecordId], references: [id], onDelete: Cascade)
  subject     Subject     @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  classArm    ClassArm    @relation(fields: [classArmId], references: [id], onDelete: Cascade)

  @@unique([staffRecordId, subjectId, classArmId])
}
```

**Why `userId` is nullable *and* `@unique` (Decision, PRD §5/§7):** this is the field that makes
"staff records vs. staff accounts" a real constraint, not just prose — a security guard gets a
`StaffRecord` with `userId: null` forever; a teacher gets one, then an admin action sets `userId`
once (never twice, hence `@unique`) when an account is provisioned.

**`StudentRecord` — no NIN/BVN field, ever, without a named exception.**

```prisma
model StudentRecord {
  id          String  @id @default(cuid())
  tenantId    String
  campusId    String?
  userId      String? @unique
  firstName   String
  lastName    String
  dateOfBirth DateTime
  admissionNo String   // school-assigned, human-facing — never used as a URL/lookup key
  isActive    Boolean  @default(true)

  tenant Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  campus Campus? @relation(fields: [campusId], references: [id], onDelete: SetNull)
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)

  enrollments   StudentEnrollment[]
  guardianLinks GuardianLink[]
  attendance    AttendanceRecord[]
  results       Result[]
  invoices      Invoice[]

  @@unique([tenantId, admissionNo])
  @@index([tenantId])
}
```

**Why no national-ID field (Decision, PRD §9, closes Audit #3/#7):** data minimization isn't a
policy statement if the schema has a `nin` column sitting there "just in case." There isn't one.
`admissionNo` is unique per tenant only (not globally), and every lookup route resolves a student
through the authenticated/authorized path (Phase 0.5), never through `admissionNo` in a URL —
closes Audit #27 (predictable export/lookup URLs) at the data-access-pattern level, not just the
URL-signing level.

**`StudentEnrollment` — the year-end-rollover model.**

```prisma
enum EnrollmentStatus {
  ACTIVE
  PROMOTED
  REPEATED
  WITHDRAWN
  TRANSFERRED
  ALUMNI
}

model StudentEnrollment {
  id         String           @id @default(cuid())
  studentId  String
  classArmId String
  periodId   String
  status     EnrollmentStatus @default(ACTIVE)

  student  StudentRecord @relation(fields: [studentId], references: [id], onDelete: Cascade)
  classArm ClassArm      @relation(fields: [classArmId], references: [id], onDelete: Cascade)

  @@unique([studentId, periodId])
}
```

**Why this is *the* rollover implementation (Decision, PRD §5/§6):** rollover is "close the current
`ACTIVE` enrollment with an outcome status, create a new row in the next period" — one function,
called either by a scheduled job (`SchoolSettings.rolloverMode = AUTOMATIC`) or an admin
click-through (`ADMIN_CONFIRMED`). The setting changes *which code path calls the function*, never
the data model — this is what "the state machine isn't optional, only whether it's automatic is"
(PRD §5) means concretely.

**`GuardianLink` — the fix for the audit's most-cited AuthZ finding.**

```prisma
enum GuardianLinkStatus {
  PENDING
  APPROVED
  REVOKED
}

model GuardianLink {
  id               String             @id @default(cuid())
  studentId        String
  guardianUserId   String
  status           GuardianLinkStatus @default(PENDING)
  approvedByUserId String?
  linkingCodeUsed  String?
  createdAt        DateTime           @default(now())

  student      StudentRecord @relation(fields: [studentId], references: [id], onDelete: Cascade)
  guardianUser User          @relation("GuardianOf", fields: [guardianUserId], references: [id], onDelete: Cascade)

  @@unique([studentId, guardianUserId])
  @@index([studentId])
}
```

**Why (closes Audit #12/#15, SEC-001/SEC-005 directly):** application code can only ever `INSERT` a
`GuardianLink` as `PENDING` from a self-service request — no code path lets a parent create their
own `APPROVED` row. A separate admin action or one-time linking-code redemption is the *only* way
`status` becomes `APPROVED`. Every parent-facing query joins through
`GuardianLink WHERE status = 'APPROVED'`, never a bare `studentId` lookup — this is what makes
Abuse Case 1 from the audit (self-link by guessing an admission number) actually impossible rather
than just discouraged.

**`AttendanceRecord` — carries the offline-sync provenance flag.**

```prisma
enum AttendanceStatus {
  PRESENT
  ABSENT
  LATE
  EXCUSED
}

enum AttendanceSource {
  ONLINE
  OFFLINE_SYNC
}

model AttendanceRecord {
  id              String   @id @default(cuid())
  studentId       String
  classArmId      String
  date            DateTime @db.Date
  status          AttendanceStatus
  markedByStaffId String
  markedAt        DateTime @default(now())
  source          AttendanceSource @default(ONLINE)

  student StudentRecord @relation(fields: [studentId], references: [id], onDelete: Cascade)

  @@unique([studentId, classArmId, date])
  @@index([classArmId, date])
}
```

**Why `source` exists (closes Audit #8, Abuse Case 2):** an `OFFLINE_SYNC` row is one that arrived
through the sync endpoint, not a live request — lets the audit trail and any anomaly detection
distinguish "marked live" from "marked offline, synced later" without a second table. The sync
endpoint itself re-runs the exact same authorization + business-rule checks as the online path
(same `withAuth`/`forTenant()` machinery from Phase 0.5) — there is no separate, weaker "offline
write" code path for an attacker to find.

**`Result` / `ResultAudit` — the state machine from PRD §5, made real.**

```prisma
enum ResultStatus {
  DRAFT
  SUBMITTED
  APPROVED
  PUBLISHED
  LOCKED
}

model Result {
  id                String       @id @default(cuid())
  studentId         String
  subjectId         String
  periodId          String
  score             Decimal
  maxScore          Decimal      @default(100)
  status            ResultStatus @default(DRAFT)
  enteredByStaffId  String
  approvedByStaffId String?
  publishedAt       DateTime?
  lockedAt          DateTime?

  student StudentRecord @relation(fields: [studentId], references: [id], onDelete: Cascade)
  subject Subject       @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  history ResultAudit[]

  @@unique([studentId, subjectId, periodId])
  @@index([periodId])
}

model ResultAudit {
  id          String        @id @default(cuid())
  resultId    String
  actorUserId String
  fromStatus  ResultStatus
  toStatus    ResultStatus
  fromScore   Decimal?
  toScore     Decimal?
  reason      String?
  createdAt   DateTime      @default(now())

  result Result @relation(fields: [resultId], references: [id], onDelete: Cascade)

  @@index([resultId])
}
```

**Why (closes Audit #11, SEC-003):** every status transition writes a `ResultAudit` row in the same
transaction as the `Result.status` change. `reason` is enforced as non-null at the application
layer for any transition originating from `LOCKED` — the DB column stays nullable (a
`DRAFT → SUBMITTED` transition genuinely has no "reason") but the API route for a post-lock
correction rejects a missing reason before it ever reaches Prisma.

**`TimetableSlot`, `Announcement` — straightforward, no audit-driven decisions.**

```prisma
model TimetableSlot {
  id            String @id @default(cuid())
  classArmId    String
  subjectId     String
  staffRecordId String
  dayOfWeek     Int    // 0–6
  startTime     String // "08:00" — a recurring weekly pattern, not a dated event, hence not DateTime
  endTime       String

  classArm ClassArm @relation(fields: [classArmId], references: [id], onDelete: Cascade)
  subject  Subject  @relation(fields: [subjectId], references: [id], onDelete: Cascade)

  @@index([classArmId])
}

model Announcement {
  id              String   @id @default(cuid())
  tenantId        String
  classArmId      String?  // null = school-wide
  title           String
  body            String
  createdByUserId String
  createdAt       DateTime @default(now())

  tenant   Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  classArm ClassArm? @relation(fields: [classArmId], references: [id], onDelete: SetNull)

  @@index([tenantId])
}
```

### 1.3 — `SchoolSettings` (PRD §14) and its step-up-auth audit trail

```prisma
enum BillingCycle          { PER_TERM  PER_SESSION }
enum RolloverMode          { AUTOMATIC  ADMIN_CONFIRMED }
enum DiscountWorkflowMode  { MANUAL_OVERRIDE  APPROVAL_REQUIRED }
enum FeeCostBearer         { SCHOOL_ABSORBS  PASSED_TO_PARENT }

model SchoolSettings {
  tenantId               String              @id  // one row per tenant, by construction
  resultApprovalRequired Boolean              @default(true)  // secure default
  rolloverMode           RolloverMode         @default(ADMIN_CONFIRMED)
  classAutoAssignment    Boolean              @default(false) // MVP: always false; field exists for later
  billingCycle           BillingCycle         @default(PER_TERM)
  feeReminderEnabled     Boolean              @default(true)
  discountWorkflowMode   DiscountWorkflowMode @default(MANUAL_OVERRIDE)
  feeCostBearer          FeeCostBearer        @default(SCHOOL_ABSORBS)
  multiCampusEnabled     Boolean              @default(false)
  mfaRequiredForTeaching Boolean              @default(true)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

model SettingsChangeAudit {
  id               String   @id @default(cuid())
  tenantId         String
  actorUserId      String
  field            String
  fromValue        String
  toValue          String
  stepUpVerifiedAt DateTime // MFA re-confirmation timestamp for THIS change — PRD §7/§14
  createdAt        DateTime @default(now())

  @@index([tenantId])
}
```

**Why `tenantId` is the primary key, not a separate `id` (Decision):** exactly one settings row
exists per school by definition — making the tenant FK the PK rules out ever accidentally creating
two, rather than relying on a `@unique` constraint someone could theoretically bypass with raw SQL.

**Why `SettingsChangeAudit` is separate from the general `AuditLog` (below), not a variant of it
(Decision, closes Audit #22):** every settings change specifically requires `stepUpVerifiedAt` to
be non-null — a column-level guarantee a generic polymorphic audit table can't enforce. The API
route for changing any `SchoolSettings` field is the only place allowed to write to this table, and
it does so *before* applying the actual settings change, not after — a step-up check that fails
never lets the underlying toggle flip.

### 1.4 — `finance.prisma`

```prisma
model FeeStructure {
  id           String  @id @default(cuid())
  tenantId     String
  periodId     String
  classGroupId String? // null = applies to all classes
  name         String  // "Tuition", "Sports Levy"
  amount       Decimal

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
}

enum InvoiceStatus { UNPAID  PARTIALLY_PAID  PAID  WAIVED }

model Invoice {
  id          String        @id @default(cuid())
  tenantId    String
  studentId   String
  periodId    String
  totalAmount Decimal
  amountPaid  Decimal       @default(0)
  status      InvoiceStatus @default(UNPAID)
  createdAt   DateTime      @default(now())

  student   StudentRecord     @relation(fields: [studentId], references: [id], onDelete: Cascade)
  payments  Payment[]
  discounts InvoiceDiscount[]

  @@index([studentId])
  @@index([tenantId, status])
}

enum PaymentProvider { PAYSTACK  FLUTTERWAVE }
enum PaymentStatus   { PENDING  SUCCESS  FAILED }

model Payment {
  id                 String          @id @default(cuid())
  invoiceId          String
  amount             Decimal
  provider           PaymentProvider
  providerRef        String          // the idempotency key
  status             PaymentStatus   @default(PENDING)
  verifiedServerSide Boolean         @default(false)
  createdAt          DateTime        @default(now())

  invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  @@unique([provider, providerRef])
  @@index([invoiceId])
}

model InvoiceDiscount {
  id               String               @id @default(cuid())
  invoiceId        String
  amount           Decimal
  reason           String
  mode             DiscountWorkflowMode
  appliedByUserId  String
  approvedByUserId String?
  createdAt        DateTime             @default(now())

  invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
}

model PaymentWebhookEvent {
  id             String          @id @default(cuid())
  provider       PaymentProvider
  eventId        String
  signatureValid Boolean
  processedAt    DateTime?
  rawPayloadHash String          // a hash, never the raw payload — PII/secret-in-logs discipline
  receivedAt     DateTime        @default(now())

  @@unique([provider, eventId])
}
```

**Why `Payment.verifiedServerSide` plus `@@unique([provider, providerRef])` together (Decision,
closes Audit #17 and #24 — the two Critical payment findings):** a webhook handler may `INSERT` a
`Payment` row the instant its signature checks out, but the code path that flips `Invoice.status`
to `PAID` is gated on `verifiedServerSide = true`, set only after a *separate*, independent
server-to-server call to the provider's transaction-verification API confirms amount, currency, and
reference all match the invoice. A forged webhook can create an unverified, `PENDING` `Payment`
row — it cannot make an invoice show as paid. The unique constraint on `(provider, providerRef)` is
enforced at the database level, so a replayed webhook physically cannot insert a second row, not
just "shouldn't."

**Why `PaymentWebhookEvent` is a second table, separate from `Payment` (Decision):** `Payment`
records a payment attempt; `PaymentWebhookEvent` records that a webhook call happened at all,
including invalid-signature attempts, which have no associated `Payment` row and would otherwise
leave no trace — closing the "rejected/invalid webhook attempts are logged and alertable" half of
the security-audit fix, not just the "valid ones are verified" half.

### 1.5 — Cross-cutting: `AuditLog`

```prisma
model AuditLog {
  id            String   @id @default(cuid())
  tenantId      String
  actorUserId   String
  action        String   // "result.approve", "invoice.discount.apply", "settings.change"
  targetType    String
  targetId      String
  beforeValue   Json?
  afterValue    Json?
  reason        String?
  correlationId String?
  createdAt     DateTime @default(now())

  @@index([tenantId, targetType, targetId])
  @@index([tenantId, createdAt])
}
```

**Migration-level enforcement, not just convention (closes Audit #19/#31):** the Phase 1 migration
`REVOKE UPDATE, DELETE ON "AuditLog", "ResultAudit", "SettingsChangeAudit" FROM <app role>` after
creating the tables — application code can only ever `INSERT` into any of the three audit tables,
enforced by Postgres itself, not by "we don't call `.update()` on these in the code."

### 1.6 — Build order within Phase 1

1. Migration: all models above + RLS policies + the audit-table `REVOKE`, in one migration.
2. `SchoolSettings` row auto-created (all defaults) whenever a `Tenant` is created — never a
   nullable "settings not configured yet" state.
3. API routes, in dependency order: `AcademicSession`/`Period` → `ClassGroup`/`Arm`/`Subject` →
   `StaffRecord` → `StudentRecord` + `GuardianLink` → `StudentEnrollment` → `AttendanceRecord` →
   `Result` (+ approval-workflow endpoints) → `FeeStructure`/`Invoice` → `Payment` + webhook
   handlers → `Announcement`/`TimetableSlot`.
4. Admin UI screens in the same order, reusing `DashboardShell`-style layout per role (Admin,
   Teaching Staff, Non-Teaching Staff, Student, Parent — PRD §3/§7).
5. Settings UI: one screen, all toggles from §1.3's table, each write going through the step-up-MFA
   flow from Phase 0.5.

**Verification gate before Phase 1 is "done" (not just "code exists"):** the cross-tenant/IDOR
negative-test suite from Phase 0.5 extended to cover every new route; a live end-to-end walk of
enroll → mark attendance → enter result → approve → publish → parent views it; a live Paystack/
Flutterwave sandbox payment, including a deliberately forged webhook attempt that must fail.

### 1.7 — Lightweight permissions (shared design with AlEemaan)

A deliberately small addition on top of Phase 0's `Role` enum, not a full RBAC engine — scoped down
specifically so MVP doesn't grow a custom-role builder or a per-resource ACL matrix it doesn't need
yet. Same design ships in the AlEemaan PRD's §4 (Users, Roles & Lightweight Permissions), so both
projects stay in sync rather than drifting into two different permission models.

```prisma
enum Permission {
  CAN_APPROVE_RESULTS
  CAN_MANAGE_FINANCE
  CAN_PUBLISH_CONTENT
  CAN_MANAGE_USERS
}

model TenantMembership {
  // ...existing fields from Phase 0 (userId, tenantId, campusId?, role)
  permissions Permission[] @default([])
}
```

- `ADMIN` implicitly has every `Permission` — the enum only exists so a *non-admin* membership can
  be granted one extra capability (a bursar who's `NON_TEACHING_STAFF` getting
  `CAN_MANAGE_FINANCE`; a senior teacher getting `CAN_APPROVE_RESULTS` without being made `ADMIN`),
  closing the gap where the only way to do more than your base role today is to become an admin.
- `withAuth(handler, { roles, permissions })` (§0.5.3's auth helper) checks `role` OR an entry in
  `permissions` — a route can require either, not both, unless it explicitly asks for both.
- **Explicit non-goals, so this doesn't become full RBAC by accretion:** no UI for a school to
  invent new permissions, no per-resource/per-record ACLs, no permission inheritance hierarchy, no
  custom roles. If a school needs more granularity than these four permissions later, that's a
  deliberate future phase, not a Phase 1 scope-creep.

---

## Phase 2 — Communication

Matches PRD §6 Phase 2. New schema file `prisma/schema/comms.prisma`.

```prisma
enum NotificationChannel  { SMS  WHATSAPP  EMAIL  IN_APP }
enum NotificationCategory { TRANSACTIONAL  EDUCATIONAL_ADMIN  MARKETING }  // NCC classification, PRD §9
enum NotificationStatus   { QUEUED  SENT  FAILED }

model NotificationTemplate {
  id           String                @id @default(cuid())
  tenantId     String
  key          String                // "fee_reminder", "result_published"
  channel      NotificationChannel
  category     NotificationCategory
  bodyTemplate String

  @@unique([tenantId, key, channel])
}

model NotificationLog {
  id                String              @id @default(cuid())
  tenantId          String
  recipientUserId   String?
  channel           NotificationChannel
  category          NotificationCategory
  templateKey       String
  status            NotificationStatus  @default(QUEUED)
  providerMessageId String?
  sentAt            DateTime?
  createdAt         DateTime            @default(now())

  @@index([tenantId, createdAt])
}

model StaffParentMessage {
  id              String   @id @default(cuid())
  tenantId        String
  senderUserId    String
  recipientUserId String
  body            String
  createdAt       DateTime @default(now())

  @@index([tenantId, recipientUserId])
}
```

**Why templates are DB rows, not hardcoded strings (Decision, closes Audit #9/#23):** every
outbound message is rendered from a `NotificationTemplate` row, never a string literal in
application code. A CI check (added in this phase) parses every `SMS`/`WHATSAPP` template tagged
`TRANSACTIONAL` and fails the build if its `bodyTemplate` contains a `{{score}}`, `{{amount}}`, or
similar sensitive placeholder — this is what makes "no grades/fee amounts in SMS body" (PRD §5/§14,
Audit #9) a build-time guarantee instead of a code-review hope. Delivery itself runs through
BullMQ jobs (PRD §7 stack table), reading these rows.

Fee reminders (already in Phase 1's `SchoolSettings.feeReminderEnabled`) get their first real
channel here — Phase 1 shipped the setting and the scheduling hook; Phase 2 is what actually sends
anything.

---

## Phase 3 — LMS

Matches PRD §6 Phase 3. New schema file `prisma/schema/lms.prisma`.

```prisma
enum FileScanStatus { PENDING  CLEAN  INFECTED  SCAN_FAILED }

model Assignment {
  id           String   @id @default(cuid())
  classArmId   String
  subjectId    String
  title        String
  instructions String
  dueAt        DateTime
  createdByStaffId String

  submissions AssignmentSubmission[]
}

model AssignmentSubmission {
  id             String         @id @default(cuid())
  assignmentId   String
  studentId      String
  fileUrl        String?        // S3/MinIO object key — never a raw filesystem path (PRD §7)
  fileMime       String?
  fileScanStatus FileScanStatus @default(PENDING)
  textResponse   String?
  submittedAt    DateTime       @default(now())
  score          Decimal?
  feedback       String?

  @@unique([assignmentId, studentId])
}

model LearningMaterial {
  id                String         @id @default(cuid())
  classArmId        String
  subjectId         String
  title             String
  fileUrl           String
  fileMime          String
  fileScanStatus    FileScanStatus @default(PENDING)
  uploadedByStaffId String
}

model Quiz {
  id        String @id @default(cuid())
  subjectId String
  title     String

  questions QuizQuestion[]
}

model QuizQuestion {
  id              String @id @default(cuid())
  quizId          String
  prompt          String
  options         Json   // [{ id, text }]
  correctOptionId String

  quiz Quiz @relation(fields: [quizId], references: [id], onDelete: Cascade)
}

model QuizAttempt {
  id          String    @id @default(cuid())
  quizId      String
  studentId   String
  answers     Json
  score       Decimal
  startedAt   DateTime  @default(now())
  submittedAt DateTime?
}
```

**Why `fileScanStatus` defaults to `PENDING` and gates the download link (Decision, closes Audit
#15/#26):** the literal enforcement point for the file-upload security finding — the application
never returns a usable `fileUrl` to anyone but the uploader until `fileScanStatus = 'CLEAN'`,
checked via ClamAV (PRD §7 stack table) in a BullMQ job triggered on upload. Extensions/MIME types
are allowlisted at the upload route before the file ever reaches storage, not just scanned after.

---

## Phase 4 — Operations

Matches PRD §6 Phase 4. Deliberately thin here — PRD §6 itself calls this "lower urgency for
typical private school pilot," so inventing exact payroll tax logic or NEMIS field mappings now
would be designing against requirements nobody has validated yet, the same reasoning `TheNiche`'s
own plan applies to its own lower-certainty phases. Full design happens when this phase is actually
scheduled against a real customer need.

```prisma
model StaffLeaveRequest {
  id            String   @id @default(cuid())
  staffRecordId String
  startDate     DateTime
  endDate       DateTime
  status        String   // approved/pending/rejected — enum deferred until the approval chain is designed
  approvedByUserId String?
}

model PayrollRun {
  id       String @id @default(cuid())
  tenantId String
  periodId String
  status   String // deliberately a string, not an enum, until tax/pension rules are scoped
}

model LibraryItem {
  id              String @id @default(cuid())
  tenantId        String
  title           String
  isbn            String?
  copiesTotal     Int
  copiesAvailable Int
}

model LibraryLoan {
  id         String    @id @default(cuid())
  itemId     String
  studentId  String
  borrowedAt DateTime  @default(now())
  dueAt      DateTime
  returnedAt DateTime?
}

model TransportRoute {
  id       String @id @default(cuid())
  tenantId String
  name     String
}

model TransportAssignment {
  id        String @id @default(cuid())
  routeId   String
  studentId String
}

model InventoryItem {
  id             String @id @default(cuid())
  tenantId       String
  name           String
  quantityOnHand Int
}

model NemisExportBatch {
  id          String    @id @default(cuid())
  tenantId    String
  periodId    String
  status      String
  submittedAt DateTime?
}
```

`NemisExportBatch` exists as a placeholder table, not a working exporter — PRD §13's competitive
note that EDVES already offers NEMIS reporting means this is worth reserving schema space for, but
PRD §6 explicitly keeps it off the roadmap "until requested," so no export logic is built here.

---

## Phase 5 — Expansion

Matches PRD §6 Phase 5, which the PRD itself frames as conditional ("depends on which market
segment gains traction first") — matching that uncertainty here rather than over-specifying:

- **Native mobile:** no new backend schema — the same versioned REST API (Phase 0.5) is consumed
  by a React Native/Expo client. Nothing to design until this phase starts.
- **Higher-ed course registration/credit units:** extends `AcademicPeriod`/`StudentEnrollment`
  with a `Course` model carrying `creditUnits`, and a registration step distinct from
  `ClassArm`-based K12 placement.
- **Vocational certifications:** a `Certificate` model tied to cohort (`AcademicPeriod{kind:
  COHORT}`) completion.
- **White-labeling/custom domains:** a `CustomDomain` model mapping a domain string to a
  `tenantId`, resolved in the *same* middleware tenant-trust-boundary layer built in Phase 0.5 for
  `/schools/[code]` — a new lookup key into the same verified-membership machinery, not a parallel
  system.

No schema for any of these should be finalized before a real signal (a paying customer, a specific
request) exists — inventing it now risks the exact "a field or enum value that sounds right but was
never actually decided" trap `TheNiche`'s own plan names as the thing to guard against.
