# Octalve Edu

School management platform — Solo (self-hosted) and SaaS (multi-tenant) editions from one codebase.

Full product requirements, architecture decisions, and the security/compliance audit live in the PRD:
https://claude.ai/artifact/W9AmZifbHByc9XxNtHCawP

## Stack

Next.js (App Router) + TypeScript + Tailwind + Prisma/PostgreSQL, multi-tenancy via Postgres Row-Level
Security (`forTenant()` pattern), packaged with a `tier-manifest.json` + `export-tier.ts` scheme mirroring
the sibling `ims` project. See the PRD's §7 (Technical Architecture) for the full stack table and rationale.

## Getting started

```bash
docker compose up -d          # local Postgres + Redis
cp .env.example .env           # fill in secrets
pnpm install
pnpm prisma migrate dev        # once the schema exists
pnpm dev
```

Open http://localhost:3000.

## Status

This repo is at the M0 (Foundation) milestone per PRD §12 — project skeleton only. No auth, no RLS
policies, no API routes yet. Next steps, in order:

1. Prisma schema: tenants, users, staff/student records, `forTenant()` RLS wrapper
2. Auth.js (database sessions) + role-based middleware + tenant-membership verification (PRD §7's
   tenant trust boundary — never trust the URL's `[code]` alone)
3. First versioned API route (`/api/v1/...`) following the pagination/filtering/envelope conventions in
   PRD §7
4. GitHub Actions CI (dev → main → prod, per PRD §7) with the security gates from the compliance audit
   (secret scanning, SCA, SAST)

## Repo layout

Lives alongside `ims` under `CODEC/OCTALVE/` per PRD §7's repo-layout decision, so tooling conventions
(tier-manifest, CI scripts) are shared rather than reinvented.
