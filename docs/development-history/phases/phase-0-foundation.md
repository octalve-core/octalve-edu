# Phase 0 — Foundation: Completion Record

**Status: Done.** Verified against the real repo on 2026-09-27, not assumed from the plan.

## What was built

- `pnpm create next-app` scaffold: Next.js 16.3.6 (App Router), React 19.2.8, TypeScript, Tailwind
  v4, `src/` directory with the `@/*` import alias, ESLint 9 config. pnpm as the package manager
  (matching the sibling `ims` project's convention), workspace file present.
- Prisma 6.19.3 + `@prisma/client` 6.19.3, with `prisma/schema.prisma` covering:
  - Auth.js's four required models (`User`, `Account`, `Session`, `VerificationToken`), configured
    for the database-session strategy that Phase 0.5 will wire up.
  - `Tenant` (with a unique `code` slug), `Campus` (multi-campus per PRD §7), and
    `TenantMembership` (`userId`, `tenantId`, `campusId?`, `role`) — the verified-membership table
    the tenant-trust-boundary check in Phase 0.5 will read.
  - A `Role` enum: `ADMIN`, `TEACHING_STAFF`, `NON_TEACHING_STAFF`, `STUDENT`, `PARENT`, matching
    PRD §7's role list.
- `tier-manifest.json`: skeleton with `shared`/`core`/`pro`/`premium` buckets, `shared` populated
  with the three files that currently exist (`layout.tsx`, `page.tsx`, `globals.css`); `core`/
  `pro`/`premium` intentionally empty — no domain code exists yet to bucket.
- `docker-compose.yml`: local-only Postgres 16 + Redis 7, explicitly commented as distinct from the
  Solo installer's future hardened compose file (PRD §7).
- `.env.example`: every variable the PRD's stack table names, none filled in.
- `README.md`: points to the canonical PRD (the Claude Doc), states the repo's current status and
  next steps in order.
- Git repository initialized, first commit made.

## The one real judgment call

`pnpm create next-app@latest` and the first `pnpm add prisma @prisma/client` both resolved to
**Prisma 8.0.0-rc.13/rc.17** — the npm registry's `latest` dist-tag currently points at a release
candidate, not the last stable release (`7.10.0` is tagged `prev`). Prisma 7 also turned out to be
a breaking change from what the sibling `ims` project uses: `datasource { url = env(...) }` inline
in `schema.prisma` is no longer accepted — Prisma 7 requires a driver-adapter + `prisma.config.ts`
setup instead.

**Decision:** downgrade to Prisma **6.19.3**, matching `ims`'s already-proven version, rather than
adopt Prisma 7's new adapter-based config on a brand-new project with zero domain code yet. This
is a consistency call, not a workaround — `ims` is the more mature sibling project this PRD's own
§7 says to mirror conventions from, and fighting a very new major-version config change while
scaffolding M0 would have been unnecessary risk for zero benefit at this stage. Revisit Prisma 7
once it's had time to stabilize past `rc`, if there's a concrete reason to (there isn't yet).

Two smaller judgment calls in the same vein: `@prisma/client`/`prisma`/`@prisma/engines`' install
scripts needed explicit `pnpm.onlyBuiltDependencies` approval (pnpm's default security posture
blocks them); and the local `docker-compose.yml` had to move off the default Postgres/Redis ports
(`5432`/`6379`) to `5433`/`6380` because this machine already had something bound to both — not a
project decision, just a fact about the dev machine, documented in the compose file itself so it
isn't a mystery later.

## How it was verified

Not claimed from reading the config — actually run:

1. `docker compose up -d` → both containers reached `healthy`/running state
   (`docker compose ps` checked directly).
2. `pnpm prisma migrate dev --name init` → applied cleanly against the real local Postgres,
   `prisma/migrations/20260927053552_init/` committed.
3. `pnpm dev` → server boots (`✓ Ready`), `curl localhost:3001` (Next picked 3001; something else
   already held 3000 on this machine) returned `HTTP 200` with the expected default page title —
   confirmed against the *actual* port Next.js chose, not assumed to be 3000.
4. `pnpm build` → clean production build, 0 TypeScript errors, both routes (`/`, `/_not-found`)
   generated as static.

## What's explicitly not here yet

No auth wiring, no RLS policies (the `Tenant`/`Campus`/`TenantMembership` tables exist but nothing
enforces row-level isolation on them yet), no API routes, no UI beyond the default scaffold page.
All of that is Phase 0.5 — see `docs/development-history/domain-implementation-plan.md`.
