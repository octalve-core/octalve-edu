# Octalve Edu — Development Progress Tracker

Last Updated: 2026-09-30

Companion to `docs/development-history/domain-implementation-plan.md` (the step-by-step build
plan), `docs/development-history/phases/*.md` (one detailed doc per completed phase), and
`docs/PRD.md` (requirements + every architecture decision, with reasoning, synced from the
canonical Claude Doc). Mirrors the structure of `TheNiche`'s own
`docs/development-history/theniche_progress.md` — this file tracks _what's actually built_, checked
against the real repo, not what a plan says should exist.

---

## Overall Status Summary

- **Planning & Architecture**: 100% — `docs/PRD.md` (14 sections + a Security & Compliance Audit
  tab in the canonical Claude Doc, cross-checked against a second independently-produced audit) and
  this implementation plan are written and cross-referenced. `docs/PRD.md` §7's tenant-trust
  boundary, §14's Settings model, and the payment-integrity fixes all trace to specific audit
  findings, cited inline in the plan.
- **Phase 0 — Foundation**: **100% Complete.** Next.js 16 + TypeScript + Tailwind scaffold,
  Prisma 6.19 + PostgreSQL with Auth.js's tables plus `Tenant`/`Campus`/`TenantMembership`,
  `tier-manifest.json` skeleton, local dev `docker-compose.yml`, git initialized. `pnpm build`
  clean, first migration applied against a real local Postgres, `pnpm dev` verified serving
  `HTTP 200`. See `docs/development-history/phases/phase-0-foundation.md` for the full record,
  including the one real judgment call (Prisma 8 rc → 6.19.3 downgrade, matching the sibling `ims`
  project).
- **Phase 0.5 — Auth, RLS & Shared API Infrastructure**: **Partially started, design complete for
  §0.5.1.** §0.5.0 (first-run superadmin setup wizard, Solo only) is **done and verified live** — see
  `docs/development-history/phases/phase-0.5.0-setup-wizard.md`. §0.5.1 (auth) went through a full
  two-AI security review, a hardening pass, and a Better-Auth-vs-hand-roll spike (resolved: hand-roll,
  adapting AlEemaan's already-built implementation) — **fully designed, zero code written yet**, no
  open questions left blocking it. §0.5.2 (tenant-trust boundary: `resolve-tenant.ts` + `forTenant()`
  + explicit RLS role setup) and §0.5.3 (shared API pagination/rate-limiting helpers beyond the
  response envelope) are designed, not built, both depending on §0.5.1 landing first. Nothing in
  Phase 1 should start before this phase's own verification gate (negative-test suite for
  cross-tenant/IDOR access, run as the `app_user` role) passes in CI.
- **Phase 1 — MVP: Core SIS + Finance**: **0% — not started.** Full schema designed
  (`sis.prisma`/`finance.prisma` in the plan doc, with every model's reasoning traced to a PRD
  section or a specific security-audit finding) but no migration written, no API routes, no UI.
- **Phase 2 — Communication**: **0% — not started.** Schema designed (`comms.prisma`).
- **Phase 3 — LMS**: **0% — not started.** Schema designed (`lms.prisma`).
- **Phase 4 — Operations**: **0% — not started.** Schema deliberately thin per the plan's own
  reasoning (PRD §6 marks this phase lower-priority; full design deferred to when it's actually
  scheduled).
- **Phase 5 — Expansion**: **0% — not started, and deliberately unscoped** beyond a directional
  sketch — PRD §6 itself frames this phase as conditional on which market segment gains traction
  first.

---

## What's real vs. what's designed-but-unbuilt

This section exists specifically to prevent the trap `TheNiche`'s own plan names: a schema decision
that "sounds right" getting treated as done because it's written down somewhere. As of this
update:

- **One route exists beyond Phase 0, and it has a migration.** `20260927223904_add_setup_wizard`
  added `User.passwordHash`, `SystemSettings`, and `AuditLog`, applied against the real local
  Postgres. Everything else in Phase 0.5 onward is still Prisma syntax inside a markdown file, not
  validated against a real database.
- **No RLS policy exists yet**, including on the Phase 0 tables (`Campus`, `TenantMembership`)
  that already exist — Phase 0's own completion doc says this explicitly, so it doesn't get lost.
- **No authentication flow works end-to-end.** Auth.js is installed nowhere yet; the `User`/
  `Account`/`Session` tables exist in the schema but nothing reads or writes them (the setup
  wizard writes `User.passwordHash` directly with Prisma — it doesn't go through Auth.js).

## Recent changes (2026-09-28)

- **Prisma schema is now multi-file**: `prisma/schema.prisma` split into
  `prisma/schema/{schema,auth,tenancy,setup}.prisma` (Prisma's "schema folder" mode, stable since
  6.7, no preview flag needed on the installed 6.19.3), with a new `prisma.config.ts` pointing the
  CLI at the folder — same convention already used by the sibling `ims` and `AlEemaan` projects.
  `pnpm prisma validate`, `pnpm prisma generate`, and `pnpm build` all verified clean against the
  split. Every future phase's models get their own file (`sis.prisma`, `finance.prisma`,
  `comms.prisma`, `lms.prisma` — already named in the plan doc's schema sketches) rather than one
  file growing indefinitely.
- **Cross-project finding folded into §0.5.1's design**: AlEemaan (sibling project, same stack)
  discovered building its own identical Phase 0.5.1 that Auth.js v5 refuses a `Credentials` provider
  combined with `session.strategy: "database"` outright — exactly the combination
  `domain-implementation-plan.md`'s §0.5.1 currently describes wiring. A warning citing AlEemaan's
  fix (hand-rolled login/logout against the `Session` table instead of Auth.js's own Credentials
  flow) is now inline in that section, so this doesn't get rediscovered live the same way.

## Auth hardening pass (2026-09-29)

`domain-implementation-plan.md` §0.5.1 now has a full route-level design for the hand-rolled
login/logout (guard order, cookie shape) instead of just "expect to do the same as AlEemaan" —
written to the same precision as AlEemaan's shipped version, plus fixes found by auditing that
version after the fact rather than repeating them here:

- A constant-time response (AlEemaan's version has a real timing side-channel — skips
  `bcrypt.compare` entirely on a missing user, so "no such account" answers faster than "wrong
  password" even with identical status codes).
- A `lib/auth/csrf.ts` call on both routes (the helper already exists in this repo from the setup
  wizard, but nothing said the hand-rolled login has to use it — easy to forget since Auth.js's own
  Credentials flow would have handled this invisibly).
- A fresh, server-generated 256-bit session token on every login (session-fixation defense, named
  explicitly rather than left implicit).
- Email normalization (`trim().toLowerCase()`) applied everywhere `User.email` is read or written,
  not just at login.
- The session lifetime (30 days) as one shared constant, not duplicated separately in `src/auth.ts`
  and the login route the way AlEemaan currently has it (a real drift risk in AlEemaan worth not
  repeating).
- Rate-limit bucket records failed attempts only, not every request — stated explicitly since
  §0.5.3 describes the limiter as generic middleware, vague enough to get built wrong.

§0.5.3's rate limiter is now also specified to key on `ip + email` combined, not IP alone, fixing a
shared-IP lockout problem in AlEemaan's current in-memory limiter.

## Second auth hardening pass (2026-09-30) — two-AI review

`domain-implementation-plan.md` §0.5.1–0.5.3 rewritten against a full two-AI cross-review of both
this plan and AlEemaan's shipped auth code (record: `docs/auth-review-2026-09-29.md`). Sixteen
findings incorporated, three of them changing real design decisions rather than just adding detail:
`SET LOCAL` string interpolation replaced with parameterized `set_config()` (the RLS safety net had
its own SQL-injection surface); RLS role setup made explicit (`app_user` with `NOBYPASSRLS` +
`FORCE ROW LEVEL SECURITY` — RLS policies are otherwise inert against the table-owner role Prisma
migrations typically use, meaning CI's own negative tests could pass while protecting nothing); and
`@upstash/ratelimit` identified as incompatible with the plain self-hosted Redis container
`docker-compose.yml` actually provisions. Also verified independently (web search, not assumed):
Better Auth's team now maintains Auth.js (took over September 2025; Vercel acquired Better Auth July
2026) — Auth.js is maintenance-mode only now, which reopened whether to evaluate Better Auth for this
phase specifically.

## Better Auth spike — resolved 2026-09-30: hand-roll, mirroring AlEemaan

Ran the spike rather than guess. Better Auth fits well on database sessions, TOTP MFA, and session
listing/revocation — but its **hashed-session-token-at-rest** support (the one genuinely
non-negotiable requirement here) is **not shipped**, only an unmerged draft PR
(better-auth/better-auth#11444). Its `organization`/`teams` plugin also doesn't map as cleanly onto
`Tenant`→`Campus` as the schema already built here. Decision: hand-roll §0.5.1, adapting
**AlEemaan's already-built, already-verified implementation** (`src/lib/auth/{session,password,
rate-limit}.ts`, full record in that repo's `docs/development-history/phases/phase-0.5.1.5-auth-rebuild.md`)
rather than building from scratch or adopting Better Auth. `domain-implementation-plan.md` §0.5.1
updated with the full reasoning and the explicit "port AlEemaan's code, adapted for
TenantMembership/Campus" instruction. This closes the last open design question blocking §0.5.1 —
nothing left to decide before writing code.

## Next action

**Build §0.5.1** — no remaining open design questions. Port AlEemaan's `session.ts`/`password.ts`/
`rate-limit.ts`, adapted for `TenantMembership`/`Campus` (`requireAdmin()` → `withAuth()`,
`Membership.branchId` → `TenantMembership.campusId`). Then the tenant-trust-boundary resolver and
`forTenant()` with its now-explicit RLS role setup (§0.5.2) — this needs a real `app_user` Postgres
role created first, not just the Prisma migration owner. Then the shared API helpers (§0.5.3). Then
that phase's negative-test verification gate — **run as the `app_user` role, not the migration
owner** — before Phase 1 begins.
