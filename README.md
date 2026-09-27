# Octalve Edu

School management platform — Solo (self-hosted) and SaaS (multi-tenant) editions from one codebase.

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
Everything from Phase 0.5 onward (auth, RLS, API routes, every domain feature) is planned but not
yet built — see the progress tracker linked above for the current, honest state.

## Repo layout

Lives alongside `ims` under `CODEC/OCTALVE/` per PRD §7's repo-layout decision, so tooling
conventions (tier-manifest, CI scripts) are shared rather than reinvented.
