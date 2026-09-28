# Phase 0.5.0 — First-Run Superadmin Setup Wizard (Solo Only): Completion Record

**Status: Done.** Verified against the real repo and a real local Postgres, not assumed from the
plan. Built out of sequence relative to the rest of Phase 0.5 (§0.5.1–0.5.3) — see
`docs/development-history/domain-implementation-plan.md` §0.5.0 for why.

## What was built

- **Schema** (migration `20260927223904_add_setup_wizard`): `User.passwordHash String?`; a
  `SystemSettings` singleton (`id = "global"`, `setupComplete Boolean`); `AuditLog` brought forward
  from Phase 1's design.
- **API**: `src/app/api/v1/setup/route.ts` — `GET` (public status check) and `POST` (the bootstrap
  itself), both hard-404 outside `DEPLOYMENT_MODE=solo`. `POST` is guarded by CSRF
  (`src/lib/auth/csrf.ts`), an in-memory IP rate limiter (`src/lib/auth/rate-limit.ts`), Zod
  validation, an optional `SETUP_TOKEN` compared with `crypto.timingSafeEqual`, and an atomic
  conditional transaction that creates the Tenant, the first `User` (with `passwordHash`), its
  `TenantMembership` (`role: ADMIN`), and an `AuditLog` row together — or fails the whole thing if
  another request already completed setup first.
- **Supporting libs, new**: `src/lib/db.ts` (Prisma client singleton), `src/lib/api/envelope.ts`
  (PRD §7's `{ data, meta, error }` response shape — the first route to need it), `src/lib/tenant/
  validate-code.ts` (tenant-code slugify + format/reserved-word rules from PRD §7, reused as-is by
  the future SaaS signup flow).
- **Frontend**: `src/app/setup/page.tsx` (Server Component — 404s outside Solo, redirects to
  `/login` if already complete, fails open on a DB error) and `src/app/setup/SetupWizardForm.tsx`
  (school name, admin name/email, password ×2 with a live checklist, optional setup-token field).
- `.env.example`: added `SETUP_TOKEN`.
- Dependencies added: `bcryptjs`, `zod`.

## The one real judgment call

Octalve Edu is multi-tenant (Solo + SaaS from one codebase), unlike `proplity` (the reference
implementation this was adapted from), which is single-tenant. PRD §4 names a "one-time setup
wizard" only in Solo's onboarding row, with zero further elaboration anywhere in the document.
**Decision:** scope this feature to Solo only — it bootstraps the one `Tenant` a Solo install ever
has, plus its first `ADMIN`. SaaS mode 404s the entire route (not just the UI), since a school
signing up in SaaS mode will go through a separate, not-yet-built self-serve registration flow — a
"global platform operator" superadmin is a different, unrequested concept and isn't built here.

Smaller judgment calls, same vein: `AuditLog` (Phase 1's design, §1.5 of the implementation plan)
was created now instead of when Phase 1 actually starts, because this route needed a real audit
trail immediately and duplicating a smaller one-off table would have diverged from the model
already designed for exactly this purpose. The rate limiter is in-memory rather than the
`LoginAttempt`-backed one Phase 0.5.1 will build for login — deliberately not shared with that
work, since Solo always runs as one long-lived process (Docker Compose), never serverless, so
in-memory state can't be bypassed by hitting a different instance; revisit if that assumption ever
changes.

## How it was verified

Not claimed from reading the code — actually run:

1. `pnpm add bcryptjs zod` (dropped the `@types/bcryptjs` stub afterward — bcryptjs ships its own
   types).
2. `pnpm prisma migrate dev --name add_setup_wizard` → applied cleanly against the real local
   Postgres (`prisma/migrations/20260927223904_add_setup_wizard/`).
3. `pnpm build` → clean production build, 0 TypeScript errors, `/api/v1/setup` and `/setup` both
   listed as dynamic routes.
4. `DEPLOYMENT_MODE=solo pnpm dev` (port 3001 — 3000 was already in use):
   - `GET /api/v1/setup` → `{"data":{"setupComplete":false,"requiresToken":false},...}`.
   - `POST /api/v1/setup` with a real payload → `201`, a real `Tenant` (`bright-future-academy`),
     `User`, `TenantMembership`, and `AuditLog` row created in the database.
   - A second `POST` immediately after → `409 ALREADY_COMPLETE`, confirming the atomic guard.
   - `GET /api/v1/setup` afterward → `setupComplete: true`.
5. `DEPLOYMENT_MODE=saas pnpm dev` (port 3000) → both `GET /api/v1/setup` and `GET /setup` returned
   `404`, confirming the SaaS lockout.
6. Test data truncated from the local dev database afterward (`TRUNCATE "AuditLog",
   "TenantMembership", "Tenant", "User", "SystemSettings" CASCADE`) so local dev starts clean again.

## What's explicitly not here yet

No email to the new admin (no delivery provider wired up yet). No Campus/branch creation in the
wizard itself. The rest of Phase 0.5 (Auth.js wiring, the tenant-trust-boundary resolver, RLS
policies, the shared pagination/rate-limiting helpers) — see
`docs/development-history/domain-implementation-plan.md` §0.5.1 onward.
