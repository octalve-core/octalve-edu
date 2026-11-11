# 0049: The six migrations nobody has run become one

- **Period / Focus:** 2026-11-11 (the maintainer: "can't you merge this whole thing into one, I don't even have a production nor preview database yet, everything is scrappable")
- **Status:** Built and tested; PR into `dev`
- **Priority:** Low
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-squash-migrations` / PR into `dev`
- **Started:** 2026-11-11

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Replace the six migrations that were waiting for the maintainer to run on a hosted database with ONE migration that produces exactly the same schema, so the maintainer has one thing to run (or, with no hosted database yet, nothing to run in order).

## 2. Context

- The six, in order: `20261122090000_progress_records` (task 0030), `20261123090000_promotion` (0031), `20261124090000_streams` (0035), `20261125090000_report_remarks` (0036), `20261126090000_promotion_undo` (0040), `20261127090000_exam_name` (0048). They are 248, 123, 20, 52, 47 and 26 lines.
- The maintainer has no production and no preview database. No hosted database has ever applied any migration, so nothing anywhere records the old names and a changed history breaks no one except local databases (below).
- A migration that has been applied is never edited, because every database that applied it would then disagree with the file. That rule is what this task is allowed to break, and ONLY because nothing hosted has applied these six. It must not be reused once a hosted database exists.
- Local and test databases that applied the old six hold their old names in `_prisma_migrations`. After this change `migrate deploy` on such a database tries to run the new migration on top of tables that already exist and fails. They are scrapped and re-created (a test lane's database is created and migrated by the setup project; the maintainer's own development database needs `prisma migrate reset`).

## 3. Decisions

- **D1. Concatenate, do not regenerate.** The six files hold hand-written SQL that Prisma cannot regenerate from the schema: check constraints, row-level-security policies, triggers, grants, the replaced `assessment_scheme_locked_guard()` function. Asking Prisma for a fresh migration from the schema would silently lose them. The new file is the six files in their old order.
- **D2. The new name is `20261122090000_progress_promotion_results`.** It keeps the first of the six's timestamp, so it still sorts after `20261121090000_program_completion` and before anything written later.
- **D3. The old comments stay, under a banner per old file.** They say why each statement exists. The comments that tell the maintainer to "run it after ..." are now history; a header says so.
- **D4. One Postgres rule to respect.** `ALTER TYPE ... ADD VALUE 'CANCELLED'` (the undo migration) cannot be USED in the transaction that adds it. Nothing in the six uses the value (checked: `CANCELLED` appears once, in that statement and its comment), so one file is valid on Postgres 12 and later. Said in the file's header so nobody appends a statement that uses it.
- **D5. Only these six.** The 50 migrations before them are not touched: it is a bigger change with a bigger test, and nothing asked for it. (If the maintainer wants the whole history as one baseline, that is the same method applied to all 56 and a fresh `migrate dev`; say so.)
- **D6. Proof is the schema, not the file.** Two scratch databases start from the same state (every migration before these six). One applies the six in order, the other the single new file. Their schemas (`pg_dump --schema-only`: tables, columns, constraints, indexes, policies, triggers, functions, grants) must be identical. Then a fresh test lane applies the whole history with `migrate deploy` and the suites that exercise these tables run.
- **D7. Nothing else changes.** No `schema.prisma` change (the Prisma models already describe the final schema), no code, no test logic.

## 4. Work breakdown

- [x] Design (this file).
- [x] The new migration (the six, in order, with banners), the six folders removed.
- [x] Schema equivalence: scratch databases A (six) and B (one) compared.
- [x] A fresh test lane applies the full history; the unit project and the specs on these tables pass.
- [x] Docs: HANDOVER, CLAUDE.md banner, tracker, the six task records' migration lines, the maintainer's "migrations to run" lists.

## 5. Not in this task

- Squashing the older 50 migrations.
- AlEemaan's own list of pending migrations (another repository, another history).
- Touching the maintainer's development database `octalve_edu` or `octalve_edu_test`: they need a reset by the maintainer.

## 6. Build record and tests

**Built on** `claude/octalve-squash-migrations`. New: `prisma/migrations/20261122090000_progress_promotion_results/migration.sql` (562 lines: a header, then the six files in their old order, each under a banner and unchanged). Removed: the six folders. Changed: `scripts/lanes.mjs` (below). No `schema.prisma` change, no application code, no test logic.

**Proof that it is the same schema.** Two scratch databases were made from one base (the 49 migrations before these six, applied with `psql`, with `_prisma_migrations` created first because an older migration touches it). One was given the six in order, the other the single file. `pg_dump --schema-only --no-owner --no-comments` of both, with the random `\restrict` token lines that `pg_dump` 16.15 adds removed: **identical, 13,427 lines** (tables, columns, constraints, indexes, row-level-security policies, triggers, functions, grants). A control, the base plus five of the six, **differs** (6 lines: the locked-scheme trigger function without `examName`), so the comparison can fail. None of the six has an `INSERT`, `UPDATE` or `DELETE`, so there is no data to compare. The scratch databases were dropped.

**Proof that Prisma applies it.** Lane 4's test database had been dropped (it held a deliberately broken migration from the 0048 mutation check), so it was fresh. A clean build, then the setup project ran `prisma migrate deploy` on the new database: all 50 migrations applied, `prisma migrate status` says "Database schema is up to date!" with 50 applied, none rolled back, the last being `20261122090000_progress_promotion_results`. On that database: **the whole `unit` project, 1,214 passed; 22 API spec files on these tables and neighbours, 292 passed** (`promotion`, `promotion-streams`, `promotion-undo`, `progress-records`, `report-remarks`, the report-card specs, `results-*` including `results-scheme-points`, and the grade, class and enrolment specs), 0 failed.

**What the build found.**
- **`scripts/lanes.mjs sync` breaks a lane when a branch removes or merges migrations.** It deleted files that are gone from the checkout but left their empty folders, and `prisma migrate deploy` stops on an empty migration folder with P3015 ("Could not find the migration file at migration.sql"). My first API run on lane 4 failed in its setup step with exactly that. Sync now also removes a directory that is gone from the checkout and empty (a directory the checkout still has is left alone). Checked by hand: an empty stale `tests/zz-stale-empty/inner` was removed by one sync, the lane then had 51 migration folders like the repository, and real folders were untouched. There is no unit test of `lanes.mjs`; I did not add one.
- A first try with `--project=unit` together with API spec paths found no tests (Playwright filters the project by the paths); the two were run separately.
- `prisma migrate diff --from-url <the migrated database> --to-schema-datamodel` is NOT clean (exit 2): it lists composite tenant foreign keys that exist in the database and not in `schema.prisma` (on tables of these six and on `ProgramCertificate`, from an older migration) and an index on `Result.verificationToken`. That is how the repository already is (the foreign keys are hand-written in SQL), not something this change introduced, and the exact equality of the two `pg_dump` outputs is the check that matters here; so `--exit-code` is not a usable gate for this repository.

**Static gates:** `eslint` clean on `scripts/lanes.mjs`; Prettier `--check` clean on every changed file; `verify_catalogs` clean. The application's `tsc` and lint were not re-run: no `.ts` or `.tsx` file changed. The clean build in lane 4 was made from this tree before the `lanes.mjs` fix, which is not part of the build.

**Not tested, and not claimed.** The whole `api` and browser projects were not re-run (the schema is byte-identical by dump, and 292 API specs on the tables concerned passed on a database built from the new file). No hosted database was touched or exists. The old remote database that HANDOVER section 3 describes (October, 31 migrations applied) was not looked at; it is older than all six, so nothing here can change it, but if any of the six was ever run on it by hand, this merge would break it. The maintainer's `octalve_edu` and `octalve_edu_test` still hold the old names and need `prisma migrate reset`. The 50 older migrations are not squashed.
