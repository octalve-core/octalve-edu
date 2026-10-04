# Auth verification follow-up — 2026-09-30

A dated snapshot, in the same spirit as `auth-review-2026-09-29.md` (which stays as written): that
review was done by *reading* the design and AlEemaan's shipped code. This follow-up records what
happened when the design was *built and executed* — in Octalve Edu (`phases/phase-0.5.1-auth.md`) and
then in AlEemaan (`phase-0.5.1.6-octalve-sync.md` in that repo) — under a repeatable suite
(`pnpm test`, `tests/README.md`) whose security assertions were each shown to fail when the bug they
guard is injected (mutation testing).

## Status of the 2026-09-29 findings

| # | Finding | Status after the build | Evidence |
| :-- | :-- | :-- | :-- |
| 1 | Limiter: untrusted IP, check-then-record race, unbounded `Map` | **Fixed and tested, both repos** | atomicity test (50 concurrent racers → exactly the limit win), spoofed `X-Forwarded-For` ignored, LRU bound; mutations caught |
| 2 | Plaintext session tokens | **Fixed and verified in the database, both repos** | the cookie value appears in no column of any `Session` row; only its SHA-256 does |
| 3 | Login timing side-channel | **Fixed and measured, both repos** | unknown-account vs wrong-password medians within a factor of 2 (a skipped bcrypt would be ~1000× faster); mutation caught |
| 4 | Logout may fail to clear a `__Host-`/`__Secure-` cookie over HTTPS | **CLOSED — verified in real Chromium over real TLS, both repos** | login: Chromium accepts the `__Host-` cookie (it only does if Secure + `Path=/` + no Domain); logout: the cookie is gone from the browser's jar. Injecting a bare `cookies.delete()` turns this suite red — the reviewers' suspicion was right about the *class* of bug and it is now impossible to reintroduce unnoticed |
| 5 | Session lifecycle | **Built, both repos** — rotation, per-user cap, two-level expiry (90 d; 7 d for ADMIN), purge, `revokeUserSessions()` | integration suite. Note: `revokeUserSessions()` exists but has no caller yet (no password-change / role-change / deactivation flow exists to call it) |
| 6 | Branch/campus-blind admin authorization | **Decision stands, now enforced in the right place** | AlEemaan: `withAuth({ roles })`, school-wide by design (tests: an admin anchored to another branch still passes; demotion is effective on the next request). Octalve Edu: `roles`/`permissions` are a compile error + module-load throw until §0.5.2 gives a role a *verified tenant* to be evaluated against |
| 7 | Email case only in app code | **Fixed at the database level, both repos** | `CHECK (email = lower(email))`; live negative test; AlEemaan's migration verified on legacy-shaped data, including the collision-abort path |
| 8 | Password max length / bcrypt truncation | **Fixed — and the original fix was wrong** (see N1) | |
| 14 | Three-layer rate-limit keys | **Built and tested, both repos** | per-IP 30, per-`ip+email` 5 (hard), per-account 10 (soft — flags, never blocks) |
| 16 | Authorization in handlers, never middleware | **Enforced by construction** | `withAuth` is the guard; nothing in `middleware`/`proxy` authorizes |
| 9–13, 15, 17 | RLS / tenant trust boundary, invites, MFA, Redis limiter client, solo invariant, Better Auth | **Not part of this pass** | 17 was resolved earlier (hand-roll). The rest are §0.5.2/§0.5.3/MFA |

## New findings — none of which reading the code surfaced

Found by running the flows in a real browser, by axe-core, and by writing tests that had to *fail
first*. Each is fixed and pinned by a regression test; the phase records have the detail.

- **N1 — bcrypt silently ignores everything after byte 72, so finding 8's fix (a 128-*character* cap)
  did not do what it claimed.** Verified empirically (bcryptjs 3): a 72-byte prefix plus anything else
  verifies as the same password, so a 100-character passphrase is protected by its first 72 bytes and a
  typo after byte 72 still signs the user in. Bytes, not characters: 25 emoji are 100 bytes. Fix: new
  passwords are limited to **72 bytes and rejected past that, never truncated**; 128 characters remains
  only as login's input-size bound (login must keep accepting what existing accounts were set to —
  AlEemaan has live ones). *Applies to both repos; the design note that said otherwise is corrected in
  place in Octalve Edu's plan (#12).*
- **N2 — a native (no-JavaScript, or pre-hydration) submit of the sign-in form was a `GET`, putting the
  email and password in the URL** — browser history, proxy and server access logs. Fix: `method="post"`
  on every form that carries a password. *Both repos.*
- **N3 — the guard's own refusals were cacheable.** `withAuth` marked only the handler's success response
  `no-store`; its 401 `UNAUTHENTICATED` and 403 `CSRF` (and AlEemaan's 403 `FORBIDDEN`) carried no
  `Cache-Control`. Every response the wrapper emits is now uncacheable. *Both repos.*
- **N4 — no framing policy, no `nosniff`, no referrer policy, and `X-Powered-By` advertised the
  framework.** The sign-in and setup forms could be embedded in a hostile page. Baseline headers added
  (`X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`,
  `poweredByHeader: false`). HSTS is deliberately the reverse proxy's job (build-time config vs a
  runtime scheme). A nonce-based script CSP is still to do (§0.5.3). *Both repos.*
- **N5 — AlEemaan's logout returned an error status in a success envelope**
  (`ok({ loggedOut: false }, {}, 403)` — `error: null` on a 403). Now `fail(… 403 CSRF)`. *AlEemaan.*
- **N6 (UX/accessibility, not security):** keyboard focus fell to `<body>` after a rejected sign-in;
  small text at 3.96:1 and a button hover state at 3.76:1 contrast (WCAG needs 4.5:1); a 40 px tap
  target; a timed auto-redirect after setup (WCAG 2.2.1). All fixed with tests. *Both repos.*
- **A porting hazard (AlEemaan):** the limiter functions became `async`; `if (!reserveAttempt(k))`
  without `await` is `!Promise` — always false — and silently disables the limit, with no TypeScript
  error and none from the default ESLint config. Every call site was audited and the API suite fails if
  either is left un-awaited.

## Process note

Reading found the design gaps in the 2026-09-29 review; executing found six more classes (N1–N6)
on 2026-09-30. Two lessons worth keeping: (1) **a test that has never been seen failing has not been shown
to test anything** — one of ours looked "caught" under mutation only because it always failed, which is
why the rule is *run it unmutated first*; (2) **drive the real UI**: most of N2 and N6 are invisible to
a code review and to API tests alike.
