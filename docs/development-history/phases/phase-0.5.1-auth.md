# Phase 0.5.1 — Auth (hand-rolled, hashed database sessions)

**Status: IN PROGRESS** — started 2026-09-30. This is a live work log; it becomes an append-only
completion record (like every other file in this folder) once the status line above says Done.

Design of record: `docs/development-history/domain-implementation-plan.md` §0.5.1, in particular
"Build design for the port" and its "Decisions made during implementation". Security review this
traces to: `docs/auth-review-2026-09-29.md`. Reference implementation ported from: AlEemaan
(`docs/development-history/phases/phase-0.5.1.5-auth-rebuild.md` in that repo).

Where the work lives: branch `claude/auth-0.5.1-port` on `roji-tech/octalve-edu-fork` (the Claude
GitHub App is not installed on `octalve-core`); the maintainer opens the PR into
`octalve-core/octalve-edu`.

## What this phase delivers

Sign-in and sign-out that meet the hardened design: session tokens stored only as a SHA-256 hash,
constant-time credential checking, a reserve-then-refund rate limiter, `__Host-` cookies derived from the
configured scheme, two-level session expiry, DB-enforced lowercase emails — plus the screens a person
actually uses to do it (the setup wizard already redirected to a `/login` that did not exist).

## Work log

### 1. Design note (commit `a3578c8`)
Written before any code. Shared names with AlEemaan; three deliberate divergences from a straight port
(role checks deferred to tenant resolution; in-memory limiter with a tracked Redis requirement; two-level
expiry etc. built beyond AlEemaan); explicit out-of-scope list; verification plan.

### 2. Schema + migration `20260930121043_rebuild_auth_hashed_sessions` (commit `a3578c8`)
- `Session.sessionToken` → `tokenHash`; added `absoluteExpires`, `createdAt`, `lastUsedAt`, `userAgent`;
  dropped the unused Auth.js `Account` model.
- Existing sessions deleted first (plaintext rows cannot be hashed; none ever existed).
- `CHECK ("email" = lower("email"))` on `User`, with existing rows normalized first.
- **Verified live:** `\d "Session"` shows the new shape; a mixed-case `INSERT` is rejected by Postgres
  (`violates check constraint "User_email_lowercase_check"`), a lowercase and a NULL-email insert succeed.
- Process note: authored with `prisma migrate diff` + hand-written SQL, because `migrate dev` refuses to run
  non-interactively when it must confirm a destructive drop.

### 3. Server modules (uncommitted at time of writing → see git log)
- `lib/auth/rate-limit.ts` — reserve/refund, async API, LRU eviction, configurable trusted client-IP
  header (`CLIENT_IP_HEADER`, `TRUSTED_PROXY_HOPS`), production warning on the shared-bucket fallback.
- `lib/auth/password.ts` — bcrypt cost 12, boot-time real dummy hash, shared `PASSWORD_MAX_LENGTH = 128`.
- `lib/auth/session.ts` — 256-bit tokens, hash-at-rest, idle + absolute expiry (30 d idle; 90 d absolute,
  7 d for anyone holding an ADMIN membership), throttled sliding, per-user cap of 10, expired-row cleanup on
  login, `purgeExpiredSessions()`, `revokeUserSessions()`, `__Host-`/scheme-aware cookie, cookie cleared with
  identical attributes.
- `lib/auth/with-auth.ts` — session + CSRF for non-GET; `roles`/`permissions` are a compile error until §0.5.2.
- `lib/auth/memberships.ts`, `lib/roles.ts`, `lib/setup/status.ts`; `noStore()` in `lib/api/envelope.ts`.
- Routes: `POST /api/v1/auth/login` (three-layer limiting: per-IP 30, per-`ip+email` 5, per-account soft 10;
  rotation; shorter absolute lifetime for admins), `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
- Setup route migrated to the new limiter/hasher; 128-char password cap added.

### 4. UI
Shared primitives (`components/ui`: `TextField`, `PasswordField`, `Button`, `Alert`, icons) and `AuthShell`;
`/login`, `/dashboard`, `/` (pure router), retrofitted `/setup`; cross-tab sign-out and back/forward-cache
revalidation (`components/auth`).

### 5. Smoke test, 2026-09-30 (curl, real Postgres, `next start`)
setup → `201`; wrong password → `401 INVALID_CREDENTIALS` + `no-store`; mixed-case login → `200` with a
cookie whose `Expires` is 7 days out (ADMIN absolute cap), `HttpOnly`, `SameSite=lax`, `Path=/`; `me` with
cookie → user + membership; `me` without → `401`; logout → `200` and a `Max-Age=0` cookie with matching
attributes; the same cookie afterwards → `401`. The one-time proxy-header warning fired as designed.

## Verification status (updated as suites are built and run)

| Check | Status |
| :--- | :--- |
| `tsc --noEmit`, `pnpm build` | Passing |
| API smoke test (above) | Passing |
| Email `CHECK` negative test | Passing |
| Unit/integration: limiter, session lifecycle, `withAuth` | Not yet written |
| API suite: timing parity, rate-limit trip + spoofed header, `Set-Cookie` attributes, hash-at-rest via `psql` | Not yet written |
| Browser flows (Playwright): sign-in ok/fail, paused state, keyboard-only, reload persistence, sign-out + Back, signed-out `/dashboard`, setup → login | Not yet written |
| Real-HTTPS browser run: `__Host-` cookie set on login **and cleared on logout** (review finding P0 #4) | Not yet run |

## Explicitly not done in this phase
TOTP MFA and the pending-MFA token; password reset; breached-password check; active-devices page; the
Redis-backed limiter (required before any multi-instance SaaS deployment); role/permission gating in
`withAuth` (arrives with §0.5.2).
