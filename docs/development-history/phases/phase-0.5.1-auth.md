# Phase 0.5.1 — Auth (hand-rolled, hashed database sessions)

**Status: BUILT AND VERIFIED (2026-09-30) — awaiting the maintainer's merge.** The work lives on
branch `claude/auth-0.5.1-port` of `roji-tech/octalve-edu-fork` (the Claude GitHub App is not installed
on `octalve-core`, so the maintainer opens the PR into `octalve-core/octalve-edu` and merges it). This
file is a live work log until that merge; after it, treat it as append-only like every other file in
this folder.

Design of record: `docs/development-history/domain-implementation-plan.md` §0.5.1 — in particular
"Build design for the port" and its "Decisions made during implementation" (#1–#15). Security review
this traces to: `docs/auth-review-2026-09-29.md`. Reference implementation ported from: AlEemaan
(`docs/development-history/phases/phase-0.5.1.5-auth-rebuild.md` in that repo). Test guide:
`tests/README.md`.

## What this phase delivers

Sign-in and sign-out that meet the hardened design — session tokens stored only as a SHA-256 hash,
constant-time credential checking, a reserve-then-refund rate limiter, `__Host-` cookies derived from the
configured scheme, two-level session expiry, DB-enforced lowercase emails — plus the screens a person
actually uses to do it (the setup wizard already redirected to a `/login` that did not exist), plus a
repeatable test suite that proves each of those properties, including the one the two-AI review flagged as
never having been checked in a real browser over HTTPS.

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
- Verified live: a mixed-case `INSERT` is rejected by Postgres, a lowercase and a NULL-email insert succeed.
- Authored with `prisma migrate diff` + hand-written SQL, because `migrate dev` refuses to run
  non-interactively when it must confirm a destructive drop.

### 3. Server modules, routes (commit `760908e`)
- `lib/auth/rate-limit.ts` — reserve/refund, async API, LRU eviction, configurable trusted client-IP header
  (`CLIENT_IP_HEADER`, `TRUSTED_PROXY_HOPS`), one-time production warning on the shared-bucket fallback.
- `lib/auth/password.ts` — bcrypt cost 12, boot-time real dummy hash, `hashPassword`/`verifyPassword`.
- `lib/auth/session.ts` — 256-bit tokens, hash-at-rest, idle + absolute expiry (30 d idle; 90 d absolute,
  7 d for anyone holding an ADMIN membership), throttled sliding, per-user cap of 10, expired-row cleanup on
  login, `purgeExpiredSessions()`, `revokeUserSessions()`, `__Host-`/scheme-aware cookie, cookie cleared with
  identical attributes.
- `lib/auth/with-auth.ts` — session + CSRF for non-GET; `roles`/`permissions` are a compile error (and a
  throw) until §0.5.2.
- `lib/auth/memberships.ts`, `lib/roles.ts`, `lib/setup/status.ts`; `noStore()` in `lib/api/envelope.ts`.
- `POST /api/v1/auth/login` (three-layer limiting: per-IP 30, per-`ip+email` 5, per-account soft 10;
  rotation; shorter absolute lifetime for admins), `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
- Setup route migrated to the new limiter/hasher.

### 4. UI (commit `760908e`, refined in the verification pass)
Shared primitives (`components/ui`: `TextField`, `PasswordField`, `Button`, `Alert`, icons) and `AuthShell`;
`/login`, `/dashboard`, `/` (pure router), retrofitted `/setup`; cross-tab sign-out and back/forward-cache
revalidation (`components/auth`). Reviewed by driving the real flow in Chromium at 1440×900 and 390×844
and reading the screenshots (setup empty/invalid/complete, sign-in empty/validation/wrong-password/paused,
dashboard) — then again by the automated accessibility checks below.

### 5. Smoke test (curl, real Postgres, `next start`)
setup → `201`; wrong password → `401 INVALID_CREDENTIALS` + `no-store`; mixed-case login → `200` with a
cookie whose `Expires` is 7 days out (ADMIN cap), `HttpOnly`, `SameSite=lax`, `Path=/`; `me` with cookie →
user + membership; `me` without → `401`; logout → `200` and a `Max-Age=0` cookie with matching attributes;
the same cookie afterwards → `401`.

### 6. Verification pass (the commit that adds `tests/`)
Built the repeatable suite (Playwright Test, one runner: `unit`, `integration`, `api`, `e2e-desktop`,
`e2e-mobile`, `https`; a dedicated `*_test` database; a local TLS proxy) and then **attacked its own
tests**: for every security-relevant assertion a deliberate bug was injected into the code it guards and
the suite had to go red before the bug was reverted (table below). Driving the real flows and running
axe-core over every screen state found ten defects that reading the code had not.

## Defects found by verification (each fixed, each now has a regression test)

| # | Found by | Defect | Fix | Guarded by |
| :-- | :-- | :-- | :-- | :-- |
| 1 | Driving the real sign-in flow | After a rejected sign-in the password input was still `disabled` when `focus()` ran, so focus fell to `<body>` — keyboard and screen-reader users lost their place. | Focus is restored in an effect, after the inputs are re-enabled. | `e2e/sign-in` "…puts focus back in the password field" |
| 2 | Writing the password unit tests (empirical check of bcryptjs 3) | **bcrypt silently ignores everything past byte 72.** The 128-character cap in the design (and in AlEemaan's code) does not prevent that: a 100-character passphrase is protected by its first 72 bytes and a typo after byte 72 still signs the user in. | `PASSWORD_MAX_BYTES = 72` is *rejected* (never truncated) at every set path, with live feedback in the wizard; `hashPassword` throws as a backstop; 128 stays only as login's input bound. Design #12. | `unit/password`, `api/setup` (72/73 bytes, emoji), `e2e/setup-handoff` |
| 3 | API suite | `withAuth`'s own 401 `UNAUTHENTICATED` and 403 `CSRF` responses carried no `Cache-Control` (only the handler's success path was marked). | Every response the wrapper emits is `no-store`. Design #13. | `integration/with-auth`, `api/session-endpoints` |
| 4 | Writing the header checks | Nothing set a framing policy — the login form could be embedded in a hostile page (clickjacking) — nor `nosniff`/`Referrer-Policy`; `X-Powered-By` advertised the framework. | Baseline security headers in `next.config.ts`; HSTS deliberately left to the reverse proxy. Design #14. | `api/security-headers` |
| 5 | Browser test with JavaScript disabled | **A native (no-JS / pre-hydration) submit of the sign-in form was a GET, putting the email *and password* in the URL** — browser history, proxy and server access logs. | `method="post"` on the sign-in and setup forms. | `e2e/sign-in` "credentials never travel in the URL" |
| 6 | axe-core | Small text in `slate-500` on the dark surface measured 3.96:1 (needs 4.5:1) on the sign-in footer, the setup checklist, and the school code. | `slate-400`. | `e2e/responsive-and-a11y` (every screen/state) |
| 7 | axe-core | White on the primary button's `blue-500` hover state measured 3.76:1. | Hover/active now darken (`blue-700`/`blue-800`; ≥ 6.8:1). | same |
| 8 | Phone tap-target check | The show/hide password toggle was 40×40 px. (Also: `px-3.5 py-2` passed to the Sign-out button never applied — utility order made the base classes win — so the override was dead code.) | Toggle is 44×44; dead override removed. | same, `e2e-mobile` |
| 9 | ESLint (`react-hooks/set-state-in-effect`) | The pause countdown set state synchronously inside an effect body. | State transitions moved into the timer callback. | `e2e/sign-in` paused-state test (drives the whole 30 s countdown with a fake clock) |
| 10 | Screenshot review | The `Repeat password` placeholder was clipped in the two-column layout; the brand panel stretched with tall forms. | Shorter placeholder; brand panel is `sticky`/viewport-height. | visual review |

Findings 2, 3, 4, 5 also apply to AlEemaan and are tracked in its sync task (see "Cross-repo" below).

## Verification results

`pnpm test` = production build, then every project, against a dedicated `octalve_edu_test` database.
Playwright, Chromium 141, Node 22, Postgres 16, one worker, no retries.

| Project | Covers | Tests | Result |
| :-- | :-- | --: | :-- |
| `setup` | test database created, migrated with `migrate deploy`, emptied | 1 | pass |
| `unit` | rate limiter, password hashing/limits, `withAuth` refusals | 24 | pass |
| `integration` | session lifecycle and `withAuth` against Postgres | 36 | pass |
| `api` | login, logout, `me`, setup, all rate-limit layers, timing parity, CSRF, cookies, security headers — real HTTP against `next start` | 86 | pass |
| `e2e-desktop` | real Chromium, 1280×720: sign-in flows, setup → sign-in → dashboard, axe WCAG 2.2 A/AA on every screen and state | 40 | pass |
| `e2e-mobile` | the same on a Pixel 7 profile, plus ≥ 44 px tap targets and no horizontal scroll | 38 (+2 desktop-only keyboard tests skipped by design) | pass |
| `https` | real Chromium over real TLS: `__Host-` cookie set on login and removed on logout | 7 | pass |
| **Total** | | **232 passed, 2 skipped, 0 failed** — 3.8 min | |

Static checks on the same tree: `tsc --noEmit` clean (including the compile-time `@ts-expect-error`
checks on `withAuth`'s options), ESLint 0 errors / 0 warnings, `next build` clean.

Two runs were needed: the first full run went 230/232 because two *new* tests (the synthetic
`pageshow` ones) raced hydration — a test bug, not an application bug; fixed with a retrying assertion
and re-verified, including that the corrected tests still fail when their target code is removed.

### Mutation testing — the tests were shown to be able to fail

For each row a deliberate bug was injected, the named suite ran, and the file was restored. Every
mutation was caught (39 of 39).

| Layer | Bug injected | Caught by |
| :-- | :-- | :-- |
| unit | `await` inside `reserveAttempt` (reintroduces the check-then-record race) | atomicity test (50 racers → exactly 5 win) |
| unit | skip the dummy `bcrypt.compare` when there is no user | `password` timing comparison |
| unit | trust the leftmost `X-Forwarded-For` entry | `getClientIp` tests |
| unit | remove LRU eviction | bounded-memory test |
| unit | drop the 72-byte guard | `password` tests |
| unit | accept `roles` in `withAuth` | `with-auth` tests |
| integration | store the plaintext token instead of its hash | hash-at-rest tests (18 failures) |
| integration | ignore `absoluteExpires` on resolve | absolute-expiry test |
| integration | slide idle expiry past the absolute cap | sliding tests |
| integration | remove the 10-sessions-per-user cap | cap test |
| integration | `revokeUserSessions` ignores the user id | revocation scope test |
| integration | cookie always `Secure` (breaks plain-HTTP installs) | cookie-attribute test |
| integration | `withAuth` without CSRF | 6 tests |
| integration | `withAuth` checks the session *before* CSRF | ordering test |
| integration | drop `withAuth`'s no-store default; drop it from the 401; drop it from the 403 | 3 tests |
| api | login skips bcrypt for unknown users | timing-parity test |
| api | login without CSRF | 7 tests |
| api | limiter believes `X-Forwarded-For` | spoof test (6 failures) |
| api | never refund on success | "successful logins are free" |
| api | per-IP limit 30 → 5 | 30-failure test |
| api | no session rotation at login | rotation test |
| api | password length bound removed | budget test |
| api | drop the `no-store` wrapper on login | 14 failures |
| api | logout doesn't delete the row | logout tests |
| api | logout clears with a bare `cookies.delete()` | cookie-attribute test |
| api | session query leaks `passwordHash` | `me` test |
| api | setup without the 72-byte rule | setup test |
| api | security-headers config removed | 8 failures |
| https | **bare `cookies.delete()` on logout — the real P0 #4 bug** | "logout actually removes the cookie" |
| https | cookie not `Secure` / wrong `Path` / unprefixed name on an https deployment | 4–5 failures each |
| e2e | no focus restore after a failed sign-in | 4 failures |
| e2e | sign-in form back to a native GET | JS-disabled test |
| e2e | cross-tab broadcast removed | cross-tab tests |
| e2e | `pageshow` revalidation removed | bfcache test |
| e2e | setup wizard grows a timed redirect | timing test (WCAG 2.2.1) |

## Cross-repo: what AlEemaan must adopt

Tracked in the plan doc's "Built beyond AlEemaan" list and decisions #1–#3, #12–#14, plus the naming
table (`requireAdmin()` → `withAuth()`, file layout). Newly found in this pass and **not yet in
AlEemaan**: the 72-byte password policy at set paths (login stays at 128 — it has live accounts),
`no-store` on the guard's own refusals, baseline security headers, `method="post"` on any form that
carries a password, and the test suite itself.

## Explicitly not done in this phase
TOTP MFA and the pending-MFA token (must land before Phase 1's Settings UI); password reset;
breached-password check; active-devices page; the Redis-backed limiter (required before any
multi-instance SaaS deployment); role/permission gating in `withAuth` (arrives with §0.5.2); a nonce-based
script CSP (§0.5.3); Firefox/WebKit runs.
