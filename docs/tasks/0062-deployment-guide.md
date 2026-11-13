# 0062: A deployment guide: how to release to production, step by step

- **Period / Focus:** 2026-11-13 (the maintainer asked for a `docs/DEPLOYMENT.md` in each project that "clarifies the step by step process to deploy to production")
- **Status:** Done
- **Priority:** Medium
- **Assignee:** Claude
- **Target Branch / PR:** `claude/deployment-guide` / PR into `dev`
- **Started:** 2026-11-13

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

One document, `docs/DEPLOYMENT.md`, that a person who has never released this app can follow from an empty Vercel project to a verified production deployment, and again for every later release, with the decisions, the commands, the order that matters (the database migration first, then the code) and what to do when it goes wrong. Written for the maintainer, who approves promotions and runs the migrations.

## 2. What was checked, and how (2026-11-13), so the guide states facts and not memory

- The Vercel project's real settings through the CLI and its API, read-only: Node 24.x, the build, and the **Production Branch, which is `master`**, not `prod`; the production deployments; the environment variable NAMES (never values): `REDIS_URL`, `POSTGRES_URL`, `DATABASE_URL`, `PRISMA_DATABASE_URL` and `CRON_SECRET` only.
- The three branches in git and on GitHub: `dev` was 65 commits ahead of `master`; `prod` was last moved on 2026-11-12 and had everything `master` had; **no branch protection** on `master` or `prod`; **no GitHub Actions** workflow.
- The code: the two database roles and the production refusal to serve on an owner, superuser or `BYPASSRLS` role (`src/lib/tenant/assert-rls.ts`), `pnpm db:roles`, what each variable does and what is missing without it (`.env.example`, the sources), the in-memory rate limiter and `RATE_LIMIT_STORE=redis`, the daily cron and `CRON_SECRET`, and that **no script, route or document creates the first account on an empty SaaS database** (`/setup` is Solo-only; `platform-admin:make` needs an existing account).
- Not checked, and said so in the guide: the hosted database's contents, its roles and whether its provider lets `CREATEROLE` be used (it may not, and the app refuses to serve on an owner role); whether `x-real-ip` is the right client-address header on Vercel in practice.

## 3. Decisions

- **D1 (the maintainer, 2026-11-13).** `prod` is production, `master` is staging, `dev` is development. Vercel still has `master` as its Production Branch: the guide makes changing it the first action and warns not to merge `dev` into `master` before it is done.
- **D2 (the maintainer, 2026-11-13).** Preview (which serves staging) and Production use different databases.
- **D3 (the maintainer, 2026-11-13).** The hosted database starts empty: a new database per environment, the baseline applied, the old one not adopted.
- **D4.** The guide goes in `docs/DEPLOYMENT.md` (the maintainer's path), is linked from the README, and holds no secret and no connection string. `docs/branches-and-environments.md` (2026-09-28, names `main` and no deploy target) is marked out of date and points to it.
- **D5.** Staging is checked before production: migrate the Preview database, merge `dev` into `master`, check the staging deployment, then migrate the Production database and merge `master` into `prod`.

## 4. Work breakdown

- [x] Design (this file) and the facts of section 2.
- [x] `docs/DEPLOYMENT.md`.
- [x] README pointer; tracker.
- [ ] Not done here, and the guide names each: changing Vercel's Production Branch, making the second database and the `app_user` role, **deciding how the first account is created in SaaS mode (3.6; a `platform-admin:create` script is the recommendation)**, the email, payment and SMS accounts, the Vercel variables (all yours).

## 5. Not in this task

- Any change to Vercel, the databases or the code. A GitHub Actions workflow, branch protection and a health-check endpoint are suggestions for the maintainer, not part of this guide.
- Mutation passes (deferred to the end of PHASE 2).
