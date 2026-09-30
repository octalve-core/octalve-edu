# Octalve Edu

School management platform — Solo (self-hosted) and SaaS (multi-tenant) editions from one codebase.

**AI agent (or human) picking this up cold: read [`CLAUDE.md`](CLAUDE.md) first**, not this file —
it has the actual reading order, which docs to keep updated, and the relationship to the sibling
`AlEemaan` project (same stack, single-tenant, shares auth/schema design decisions with this repo).

Full product requirements, architecture decisions, and the security/compliance audit live in the
canonical PRD (Claude Doc): https://claude.ai/artifact/W9AmZifbHByc9XxNtHCawP — also synced into
this repo at [`docs/PRD.md`](docs/PRD.md) (the Claude Doc is the source of truth if the two drift).

The actual build plan lives in [`docs/development-history/`](docs/development-history/):
- [`domain-implementation-plan.md`](docs/development-history/domain-implementation-plan.md) — the
  full phase-by-phase plan (Phase 0.5 onward), with real Prisma schemas and every decision traced
  to a PRD section or a security-audit finding.
- [`octalve_edu_progress.md`](docs/development-history/octalve_edu_progress.md) — what's actually
  built and verified right now, checked against the real repo.
- [`phases/`](docs/development-history/phases/) — one completion record per finished phase.

[`docs/auth-review-2026-09-29.md`](docs/auth-review-2026-09-29.md) — a two-AI security cross-review
of this project's and AlEemaan's auth designs, adjudicated findings, and the reasoning behind
§0.5.1–0.5.3's hardening. Read before any auth work.

[`branches-and-environments.md`](docs/branches-and-environments.md) — the `dev`/`main`/`prod`
convention (Integration/Staging/Production), and how far the repo actually is from having it (not
far yet — one branch, no CI, no deploy target).

## Stack

Next.js (App Router) + TypeScript + Tailwind + Prisma/PostgreSQL, multi-tenancy via Postgres
Row-Level Security (`forTenant()` pattern), packaged with a `tier-manifest.json` +
`export-tier.ts` scheme mirroring the sibling `ims` project. See the PRD's §7 (Technical
Architecture) for the full stack table and rationale.

## Getting started

```bash
docker compose up -d     # local Postgres (5433) + Redis (6380) — see docker-compose.yml comments
cp .env.example .env      # fill in secrets
pnpm install
pnpm prisma migrate dev
pnpm dev
```

## Status

**Phase 0 (Foundation) is done** — see
[`docs/development-history/phases/phase-0-foundation.md`](docs/development-history/phases/phase-0-foundation.md).
**Phase 0.5.0 (first-run superadmin setup wizard, Solo only) is also done** — see
[`docs/development-history/phases/phase-0.5.0-setup-wizard.md`](docs/development-history/phases/phase-0.5.0-setup-wizard.md).
Everything else from Phase 0.5 onward (Auth.js wiring, RLS, the tenant-trust-boundary resolver,
every domain feature) is planned but not yet built — see the progress tracker linked above for the
current, honest state.

## Repo layout

Lives alongside `ims` under `CODEC/OCTALVE/` per PRD §7's repo-layout decision, so tooling
conventions (tier-manifest, CI scripts) are shared rather than reinvented.
