# Octalve Edu — Development Progress Tracker

Last Updated: 2026-09-28

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
- **Phase 0.5 — Auth, RLS & Shared API Infrastructure**: **Partially started.** §0.5.0 (first-run
  superadmin setup wizard, Solo only) is **done and verified live** — see
  `docs/development-history/phases/phase-0.5.0-setup-wizard.md`. Everything else in this phase
  (Auth.js wiring, database sessions, TOTP MFA, the tenant-trust-boundary implementation
  (`resolve-tenant.ts` + `forTenant()`), and the shared API pagination/rate-limiting helpers beyond
  the response envelope) is still just the plan in
  `docs/development-history/domain-implementation-plan.md` §Phase 0.5. Nothing in Phase 1 should
  start before this phase's own verification gate (negative-test suite for cross-tenant/IDOR access)
  passes in CI.
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

## Next action

The rest of Phase 0.5, in the order its own section of the implementation plan lays out: Auth.js
wiring (§0.5.1 — **read its inline warning above before wiring the Credentials provider as
originally written**; it will need the same database-sessions-without-Credentials fix AlEemaan already
made), then the tenant-trust-boundary resolver and `forTenant()` (§0.5.2), then the shared API
helpers (§0.5.3), then that phase's negative-test verification gate before Phase 1 begins.
