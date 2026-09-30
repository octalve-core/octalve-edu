# Auth System Review — 2026-09-29

A self-contained description of AlEemaan's shipped auth code and Octalve Edu's planned auth design
was handed to two independent AI reviewers, each of whom also reviewed the other's findings. This
document is the adjudicated record of that process — what both agreed on, where they disagreed and
which side was right, one fact independently verified, and the consolidated, prioritized action list.
`domain-implementation-plan.md`'s §0.5.1–0.5.3 already incorporate the findings that apply to Octalve
Edu's design; this file is the reasoning trail behind those changes, not a duplicate of them.

## Verified fact

**Better Auth's team took over Auth.js (formerly NextAuth) maintenance in September 2025; Vercel
acquired Better Auth in July 2026.** Auth.js is now maintenance-mode — security patches only, no new
features — and its own maintainers direct new projects toward Better Auth. Confirmed via web search,
not assumed from either AI's claim. Sources: [Auth.js is now part of Better
Auth](https://better-auth.com/blog/authjs-joins-better-auth), [Auth.js security update: July
2026](https://better-auth.com/blog/security-update-july-2026). This directly informs §0.5.1's open
"evaluate Better Auth" item — the fact is real, the decision to switch is not yet made.

## Where the two reviewers disagreed, and the adjudication

- **Session fixation on a role upgrade** — one reviewer claimed a role upgrade without session
  rotation exposes a fixation risk. **Incorrect, dropped.** Fixation specifically means an attacker
  *plants* a known session ID before a victim's login; AlEemaan mints a fresh 256-bit token on every
  login and never caches role inside the session (`requireAdmin`-equivalent checks re-read role from
  the database every request). There's no stale-session-data problem on upgrade. The real, opposite
  issue — *downgrades and deactivations* need to revoke existing sessions — was correctly identified
  by both and is in the plan (`revokeUserSessions()`, §0.5.1).
- **The proposed "delete the Map entry when its filtered array is empty" fix for the in-memory
  rate-limiter's unbounded growth** — **doesn't fix the actual attack.** The leak comes from
  `recordAttempt()`, which unconditionally creates a permanent Map entry for whatever identifier
  fails once — an attacker spoofing a unique `X-Forwarded-For` per request creates one such entry per
  request, and that entry is never revisited by anything that could clean it up. The real fix needs
  two independent things: stop trusting a client-suppliable header as the sole IP source (only trust
  what the reverse proxy itself sets), and a hard size cap / periodic sweep on the Map — not a
  conditional delete inside the check function.
- **"Freezes the event loop"** — overstated. `bcryptjs`'s async mode yields between rounds rather
  than blocking outright; the real effect under load is severe latency degradation for every
  concurrent request, not a literal freeze. Doesn't change the recommended fix (move off pure-JS
  bcrypt to native bindings or Argon2id), only the severity framing.
- **Recommending Lucia as a library to adopt** — **wrong as stated.** Lucia is no longer maintained
  as a library; its documentation was converted into a "copy this pattern into your own code"
  reference with no built-in MFA or multi-tenant/organization support. Useful specifically for its
  session-token-hashing pattern (hash the token before storing it, keep the plaintext only in the
  client's cookie) — not as a dependency to add.

## One correction neither reviewer made

Both reviewers converged on "fix the rate-limiter's check-then-record race with Redis `INCR`+`EXPIRE`
or a Lua script" for both projects. **For AlEemaan specifically, this doesn't require Redis at all.**
AlEemaan runs as a single long-lived Node process (confirmed deployment assumption, not
serverless/multi-instance) — there's no real cross-process concurrency to coordinate, only
interleaving *during `await`* within that one process. The actual fix is a reordering: reserve the
attempt synchronously, before the first `await` in the handler, using the same in-memory `Map` that
already exists — no external infrastructure needed. Redis becomes relevant only if that single-
process deployment assumption ever changes, which is a separate decision from fixing the race itself.
Octalve Edu's SaaS deployment mode may genuinely run multiple instances, so Redis is the right call
there regardless.

## Consolidated, prioritized findings

**P0 — AlEemaan, shipped code, fix before anything else touches it:**
1. Rate limiter: untrusted IP source (client-suppliable `X-Forwarded-For`) + check-then-record race +
   unbounded `Map` growth — one root cause, fix together.
2. Session tokens stored in plaintext in `Session.sessionToken` — hash before storing (SHA-256 is
   sufficient; the token is already 256-bit random).
3. Timing side-channel on login — dummy-hash `bcrypt.compare` on every failure path, including when
   `passwordHash` is null.
4. Logout cookie deletion likely fails in a real HTTPS deployment (`__Secure-`-prefixed cookies need
   matching attributes on delete, not just an expiry date) — flagged by one reviewer as unverified
   against library/browser behavior; needs an actual HTTPS end-to-end test, not just the dev-mode
   check that originally verified this route.

**P1 — design gaps worth fixing before Phase 1 (AlEemaan's own SIS work) builds on top of this auth:**
5. Session lifecycle: rotate-at-login, cap sessions per user, revoke-on-role/password-change,
   absolute expiry, purge job, and the `Session` schema columns (`createdAt`, `lastUsedAt`,
   `userAgent`) the "active devices" UI actually needs.
6. `requireAdmin`-equivalent authorization is branch/campus-blind by design (any `ADMIN` membership
   grants cross-branch access) — a deliberate decision, not an oversight, but worth being explicit
   that it was a choice.
7. Email case-sensitivity enforced only in application code, not at the database level.
8. Password max length (72-byte bcrypt truncation + unbounded-input DoS surface).

**P1 — Octalve Edu plan, incorporated directly into `domain-implementation-plan.md` §0.5.1–0.5.3:**
9. `SET LOCAL` string interpolation → `set_config()` with a real bind parameter (the RLS safety
   net's own SQL-injection surface).
10. RLS is inert unless Prisma connects as a non-owner `app_user` role with `NOBYPASSRLS` and
    `FORCE ROW LEVEL SECURITY` is set — otherwise CI's own negative tests pass vacuously.
11. Cross-tenant identity takeover: tenant admins must only send invites, never set a password
    directly for a possibly-already-existing global email.
12. MFA must issue a separate pending-state token, not a real `Session` row, until TOTP passes.
13. `@upstash/ratelimit`'s client doesn't talk to a plain self-hosted Redis container the way
    `docker-compose.yml` provisions one — needs `ioredis`/`rate-limiter-flexible`, or actual Upstash.
14. Rate-limit keying needs three layers (per-IP, per-`ip+email`, per-account), not just `ip+email`.
15. `DEPLOYMENT_MODE=solo` needs a runtime invariant (assert exactly one `Tenant` row), not blind
    trust of the env var.
16. Keep authorization in route handlers, never Next.js middleware — CVE-2025-29927 was a real,
    critical middleware-bypass vulnerability (patched 15.2.3); this design already does this
    correctly, now stated as a rule rather than an accident.

**P2 — worth deciding, not urgent:**
17. Evaluate Better Auth for Octalve Edu (not built yet, lowest possible switching cost, and its
    verified maintenance transfer makes this a live option, not speculation) — open item in §0.5.1,
    not yet decided.
18. For AlEemaan specifically (already shipped, Auth.js reduced to just the adapter), a ~40-line
    hand-written `getSession()` dropping `next-auth` entirely is viable — lower priority than the P0
    items above.

## Process note

Both reviewers were given the same self-contained handoff document (no context about this
conversation) and were then shown each other's findings for cross-review — this caught the session-
fixation and Lucia mistakes above, which neither reviewer's own single pass surfaced. Two independent
passes plus cross-review is doing real work here, not just redundant confirmation.
