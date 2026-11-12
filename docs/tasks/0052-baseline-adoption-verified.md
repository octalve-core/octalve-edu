# 0052: The one baseline, checked further: the way to adopt it on a database that has data, and the browser projects

- **Period / Focus:** 2026-11-12 (the maintainer: "and we need to resolve the weak spots", after the baseline of task 0050)
- **Status:** Built and tested; PR into `dev`
- **Priority:** Low
- **Assignee:** Claude
- **Target Branch / PR:** `claude/verify-after-squash` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Close the two weak spots that task 0050 left written down as "not tested, and not claimed": (1) the way to adopt the baseline on a database that already holds the old migration history was documented but never tried; (2) the `https` project and the browser specs (46 e2e files, desktop and phone) had not been re-run on the baseline.

## 2. Context

- Task 0050 replaced the 50 migrations with one baseline, `20260927053552_baseline`. A database that applied the old names cannot take it by `migrate deploy`. The documented way round (bring the schema up to date, empty `_prisma_migrations`, `prisma migrate resolve --applied`) was only written down.
- Three histories exist in git: **H0** = `e8178a3` (55 folders: the six migrations of tasks 0046 to 0048 still separate), **H1** = `8406b25` (50 folders: those six merged into `20261122090000_progress_promotion_results`, task 0049), and the baseline (1 folder). A database may have been made from either.
- HANDOVER section 3 still says a live remote database (`db.prisma.io`, 31 migrations applied in October) exists. It was NOT looked at here either, and nothing in this task touches a hosted database. What this task proves is the procedure, on local throwaway databases.

## 3. Decisions

- **D1. Throwaway databases only.** Made and dropped by the script (`octalve_adopt_*`), on the local Postgres (:5433); the Prisma CLI is pointed at them through `DATABASE_URL` and `DIRECT_URL` in the child process's environment only; nothing is printed that is a secret. No hosted database, no `.env` change.
- **D2. The databases are built the way a real one is built: by Prisma.** `prisma migrate deploy` of the old folders taken from git (`git archive`), so `_prisma_migrations` holds Prisma's own rows and checksums, not a hand-made imitation. One `User` row is inserted before the adoption and must still be there after.
- **D3. The schema is compared as bytes** with the same classification as task 0050: `pg_dump --schema-only --no-owner` (minus the random `\restrict` lines) of the adopted database against a reference made by the baseline alone; CHECK lines that differ only in the bracketing of AND are counted separately and must be the 13 already known; anything else counts as a difference and fails.
- **D4. Five scenarios**, each ending in the same checks: (s1) a database made from H1; (s2) from H0; (s3) the October shape: the first 31 of H0 applied, then brought up with the rest of H0, then adopted; (s4) a negative control: the baseline folder against an H1 database with NO adoption, then recovery; (s5) a variant: `resolve --applied` WITHOUT emptying `_prisma_migrations`.
- **D5. No product or schema change.** Documentation only.

## 4. Work breakdown

- [x] Design (this file).
- [x] The adoption path, tried on throwaway databases (five scenarios, section 6).
- [x] HANDOVER and the task 0050 record updated: "untried" becomes the verified procedure, with what it does not cover.
- [x] The `https` project and the 46 e2e files (desktop and phone) run on the baseline (section 6).
- [x] Docs: tracker, CLAUDE.md banner.

## 5. Not in this task

- Any hosted database, and looking at the old remote database (HANDOVER section 3). If it exists and holds data, the procedure below is what to try on a COPY of it first.
- A database whose applied migrations differ from the lists above (the October database's real list was never seen: "the first 31" is the October shape assumed from the HANDOVER's count).
- Data in tenant tables (row-level security): only a `User` row was used. `migrate resolve` writes only `_prisma_migrations`, and the schema check covers every table, policy and grant, so the risk is low, but it was not exercised with tenant data.

## 6. Build record and tests

**The procedure that was verified** (local, throwaway databases; on a real database, take a `pg_dump` first):

1. **Bring the database up to the last old state.** Take the old migration folders from git into a scratch project (`git archive 8406b25 prisma` for a database made from H1, `e8178a3` for H0 or for a database older than the six), and run `prisma migrate deploy` there against the database: it applies only the folders the database lacks. After this, `_prisma_migrations` lists the old history and the schema is the baseline's schema.
2. **Empty the migration log:** `DELETE FROM _prisma_migrations;`.
3. **In the current checkout, record the baseline as applied without running it:** `prisma migrate resolve --applied 20260927053552_baseline`.
4. **Check:** `prisma migrate status` says "Database schema is up to date!" and `prisma migrate deploy` says "No pending migrations to apply."

**Results** (script kept in the maintainer's private `out/tools/`; one run, `adopt.log` of 2026-11-12; the reference database, made by the baseline alone, has a schema dump of 13,404 lines):

| Scenario | `_prisma_migrations` before | `resolve --applied` | `status` | `deploy` | Schema against the reference | The `User` row |
|---|---|---|---|---|---|---|
| s1: H1 | 50 rows, 50 finished | exit 0 | up to date | no pending migrations | 13,404 vs 13,404 lines; 13 CHECK lines differ only in AND bracketing; 0 other | kept |
| s2: H0 | 55 rows, 55 finished | exit 0 | up to date | no pending migrations | the same: 13 and 0 | kept |
| s3: first 31, then the rest of H0 | 31 rows, then 55 | exit 0 | up to date | no pending migrations | the same: 13 and 0 | kept (inserted at 31 migrations) |
| s5: H1, log NOT emptied | 50 rows | exit 0 | up to date | no pending migrations | the same: 13 and 0 | kept |

After the adoption `_prisma_migrations` holds 1 row (`20260927053552_baseline`, finished), exactly what a database made from the baseline holds; in s5 it holds 51 (the 50 old ones and the baseline).

**The negative control (s4), and a finding.** `migrate deploy` with the baseline folder against an H1 database, without adopting, **exits 1**: `ERROR: type "AnnouncementStatus" already exists` (code 42710). The attempt changes neither the schema nor the data (0 lines differ, the row is still there), **but it leaves a failed row in `_prisma_migrations`** (51 rows, 50 finished), and from then on every `migrate deploy` and `migrate status` fails with `P3009` until the failure is recovered from. Recovery was tried and works: empty `_prisma_migrations`, `resolve --applied` of the baseline, then `status` is up to date, `deploy` has nothing to do, and the schema and the row are as in the other scenarios (13 and 0 differences). So running `migrate deploy` on an old database by mistake does no damage to the schema or the data, and the way out is the same procedure.

**What this establishes.** For a database made from either old history, and for the October shape brought up first, the documented procedure turns the database into one Prisma regards as up to date on the baseline, with the same schema as a fresh baseline database and the data intact. The variant that keeps the old rows also works; emptying the log is recommended because the result then looks like a fresh database's (one row) and no later reader has to wonder why a folder named in the log does not exist.

**The browser projects, on the baseline.** Lanes 2 and 3, built from `dev` `f11872e` (production builds, as the specs require); lane 3's database did not exist, so its `setup` project created it by `prisma migrate deploy` of the baseline alone. Playwright's own totals, no retries:

| Run | Projects | Tests run | Passed | Skipped | Failed | Time |
|---|---|---|---|---|---|---|
| Lane 2 | `setup`, `https`, `e2e-desktop` | 393 | 384 (setup 1, https 8, e2e-desktop 375) | 9 | **0** | 23.2 min |
| Lane 3 | `setup`, `e2e-mobile` | 385 | 342 (setup 1, e2e-mobile 341) | 43 | **0** | 21.9 min |

The skipped tests are skipped by condition in the spec, not parked: the 9 on the desktop run are the phone-layout tests (`test.skip(!isMobile, ...)`: `brand.spec.ts` 1, the phone tab bar and More sheet in `shell.spec.ts` 8); the 43 on the phone run are the desktop-only ones (`shell.spec.ts` 38, `sign-in.spec.ts` 2, `auth-logo.spec.ts` 1, `brand.spec.ts` 1, `theme.spec.ts` 1). Together with task 0050's runs (unit and API 2,936 passed, integration 696 passed) and task 0051's run of unit, integration and API on a lane (3,634 passed), every Playwright project of this repository has now run green on the baseline.


**Static gates:** Prettier `--check` clean on the changed files; `verify_catalogs` clean. No code changed.

**Not tested, and not claimed.** Any hosted database; the old remote database of HANDOVER section 3; a database whose applied list differs from the lists above; tenant data; a rollback of an adoption (take a `pg_dump` first). The five scenarios ran once, on PostgreSQL 16.15, Prisma 6.19.3.
