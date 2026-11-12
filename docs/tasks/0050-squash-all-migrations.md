# 0050: The whole migration history becomes one baseline

- **Period / Focus:** 2026-11-11 (the maintainer: "squash all", then "squash both": Octalve's older migrations and AlEemaan's; everything is scrappable, there is no production or preview database)
- **Status:** Built and tested; PR into `dev`
- **Priority:** Low
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-squash-all` / PR into `dev`
- **Started:** 2026-11-11

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Replace the 50 migrations that exist on `dev` (task 0049 had already merged the last six of the 56 into one) with ONE baseline migration that produces exactly the same schema, so a new database is built by one file and the history is not a thing anyone has to run in order.

## 2. Context

- The maintainer has no production and no preview database for Octalve. No hosted database has applied any of these migrations, so rewriting the history breaks nothing that lives anywhere except local and test databases (below). HANDOVER section 3 still describes a live remote database at `db.prisma.io` with 31 migrations applied (October); that was NOT looked at and is older than all of this: if it still exists, it is the one place this rewrite would matter.
- An applied migration is never edited or merged. This task breaks that rule ONLY because nothing hosted applied them; it must not be repeated once a hosted database exists.
- A first try, task 0049, merged the six newest by concatenating their files. That does not work for all 50: five of them add a value to an enum (`ALTER TYPE ... ADD VALUE`), and later files use those values (for example `"Role" CAMPUS_ADMIN` in a check constraint), which Postgres refuses inside one transaction ("unsafe use of new value"). Concatenating all 50 in one transaction fails at the first such use (tried: error at `CAMPUS_ADMIN`).
- The 50 migrations write no data (applied to an empty database they leave every table empty), so a schema-only baseline loses nothing.

## 3. Decisions

- **D1. The baseline is a dump of the final schema.** `pg_dump --schema-only --no-owner` of a database that the 50 migrations were applied to, one file at a time as Prisma applies them. Every table, column, constraint, index, row-level-security policy, trigger, function and grant is in it. The enum values are simply part of each type, so the enum problem disappears.
- **D2. Five edits to the dump, and no others.** (1) The `\restrict` / `\unrestrict` lines (psql-only, written by `pg_dump` 16.15) and the `set_config('search_path')` and session `SET` lines are removed, keeping only `SET check_function_bodies = false` with a `RESET` at the end. (2) `ALTER DEFAULT PRIVILEGES FOR ROLE <migrator>` is written without the role. (3) The 18 "owner" policies, which the migrations made with `format(... TO %I, current_user)`, are written `TO CURRENT_USER` instead of the migrator's name, so the file works for whichever role runs it. (4) The four string literals that hold a carriage return, a form feed and a non-breaking space (the trim set of some CHECK constraints) are written as `E' \t\r\n\f\v '` escapes, as the original migrations wrote them, so no tool that normalises line endings or invisible characters can change them (and `source-hygiene` forbids literal control characters). (5) A header says what this is.
- **D3. The name is `20260927053552_baseline`**, the first migration's timestamp, so it sorts before everything and any later migration comes after it.
- **D4. What is lost, and where it is.** The comments that explained each hand-written statement, and the order they were made in. They stay in git history (`git show 8406b25:prisma/migrations/<name>/migration.sql`) and in the task records under `docs/tasks`. The baseline's header says so.
- **D5. The proof is the schema and it is compared as BYTES.** Database A: the 50 originals applied one by one. Database B: the baseline alone. `pg_dump --schema-only` of both, compared byte for byte. A control (the 49 first originals) must differ, and the dump of B must reload into a third database to the same dump (a fixed point). Then a fresh test lane applies the baseline with Prisma's own `migrate deploy` and the unit, API and integration projects run on it.
- **D6. Tests that read a migration file.** One spec, `tests/integration/question-bank-schema.spec.ts`, read the question-bank migration file to assert that it was "additive" (no `DROP`, no `INSERT`...) and to check its RLS statements and its list of stores. A file that no longer exists cannot be read. The two "additive" tests (about historical file content) are removed; the other two are kept and ported to ask the migrated database (`pg_class.relrowsecurity` / `relforcerowsecurity`, `pg_policies`, `pg_get_constraintdef` of the store check against `STORE_NAMES`).
- **D7. Nothing else changes:** no `schema.prisma` change, no application code.

## 4. Work breakdown

- [x] Design (this file).
- [x] The baseline migration; the 50 folders removed.
- [x] Byte-exact schema equality with a control and a fixed-point check.
- [x] A fresh lane applies it with `migrate deploy`; unit, API and integration projects, and browser specs, pass.
- [x] The question-bank spec no longer reads a migration file.
- [x] Docs: HANDOVER, CLAUDE.md banner, tracker.

## 5. Not in this task

- AlEemaan (its own repository and history, its task 0051).
- Any hosted database.
- Looking at the old remote database (HANDOVER section 3).
- Adopting the baseline on a database that has data (the `migrate resolve --applied` path above was untried when this was written; it was tried afterwards: task 0052).

> **Existing databases (added after the merge):** **A database that already holds the old history and has data to keep** (HANDOVER section 3 describes one at `db.prisma.io`, 31 migrations applied in October; whether it still exists was not checked) cannot take `migrate deploy` any more: drop and recreate it, or bring it up to the baseline's schema first (apply the old migrations it lacks, from git: `git show 8406b25:prisma/migrations/<name>/migration.sql`, and for the six of task 0049 `e8178a3`), empty `_prisma_migrations`, and run `prisma migrate resolve --applied 20260927053552_baseline` (records it as applied without running it). **That path was not tried when this was written; it was tried afterwards, on local throwaway databases, and works: task 0052.**

## 6. Build record and tests

**Built on** `claude/octalve-squash-all`. New: `prisma/migrations/20260927053552_baseline/migration.sql` (12,001 lines: a header and the final schema). Removed: the 50 migration folders. Changed: `tests/integration/question-bank-schema.spec.ts` (D6) and `tests/integration/rls.spec.ts` (four lines, below). No `schema.prisma` change, no application code.

**Proof that it is the same schema, compared as bytes.** Database A: the 50 originals applied one by one with `psql -1` (as Prisma runs a file). Database B: the baseline alone. `pg_dump --schema-only --no-owner` of both (minus the random `\restrict` token lines), compared byte for byte: **13,391 of 13,404 lines identical; the other 13 are CHECK constraints that differ only in the bracketing of AND chains** (the original SQL used `BETWEEN`, which Postgres keeps as a nested AND; reloading the dump text flattens it; AND is associative, and `pg_dump` and restore rely on exactly that), **and no other difference**. The four lines that hold the trim literal (carriage return, form feed, non-breaking space) are byte-identical in A and B. A control (the first 49 originals) differs by 1,081 lines, so the comparison can fail. The dump of B loaded into a fresh database and dumped again is identical to the dump of B (a fixed point). The scratch databases were dropped. Nothing in A is data: the 50 migrations leave every table empty.

**Proof that Prisma applies it.** Lanes 1 and 2 had fresh databases. The setup project ran `prisma migrate deploy` on each (the baseline is the only migration) and the suites ran on them.

**What the build found.**
- **A plain concatenation of the 50 files does not work.** In one transaction it fails at `unsafe use of new value "CAMPUS_ADMIN" of enum type "Role"` (five migrations add enum values and later files use them). That is why the baseline is a dump (D1) and not the concatenation task 0049 used for six.
- **`pg_dump` writes the migrating role's name into the schema** (the 18 "owner" policies and `ALTER DEFAULT PRIVILEGES FOR ROLE`); the originals used `current_user`. Written back as `TO CURRENT_USER` and without the role (D2), so the file works for whichever role runs it.
- **A bug of mine, found by the test suite:** my first baseline was generated by a script that read the dump in text mode, which silently turned the carriage return inside the trim literal into a newline (four places), so those four CHECK constraints would have trimmed one character fewer; and the first comparison I ran read both dumps the same way, so it could not see it. `source-hygiene` (unit project) failed on the literal form feed that was left in. I stopped that lane's run, regenerated the file byte-exactly with the literal written as `E' \t\r\n\f\v\u00a0'` escapes (D2 (4)), and redid the comparison on bytes (the numbers above).
- **The `integration` project had not been run by my earlier regressions** (tasks 0046 to 0049 ran the unit and API projects and browser specs). Run for this task on a fresh database it had **two failures, both on `dev` already**: `rls.spec.ts` lists the tables a runtime role may touch and the tables with row-level security, and neither list had `PromotionReversal` (task 0040: insert and select only, RLS forced) or `ReportRemark` (task 0036). `origin/dev`'s copy of the spec mentions neither name. Fixed in four lines: `PromotionReversal` is expected to have `INSERT` and `SELECT` only and is in the append-only set; both names are in the list of tenant tables.
- `question-bank-schema.spec.ts` read the question-bank migration file (D6): ported as described.
- `prisma migrate diff` against the schema is not clean in this repository (hand-written composite tenant foreign keys that `schema.prisma` does not model; it predates this task), so it is not a usable gate here.

**Tests.** On the baseline, fresh lane databases: unit and API **2,936 passed, 0 failed** (lane 1, includes `source-hygiene`); integration **696 passed, 0 failed** (lane 2, after the `rls.spec.ts` fix; the first run on the unfixed spec had the two failures above); browser (`academics`, `results-screens`, `promotion-screens`, `shell`, `responsive-and-a11y`, desktop and phone) **145 passed, 0 failed** (lane 1). **Mutation check of the two ported tests**, each applied alone to lane 2's database and the right test failing, restored afterwards: `NO FORCE ROW LEVEL SECURITY` on `QuestionBankImage` fails the RLS test; a `FOR DELETE` policy on `QuestionBankItem` fails the same test on its other assertion; the store check without `'memory'` fails the store test; the unmutated and the restored runs pass (3 of 3).

**Static gates:** `tsc --noEmit` clean; `eslint` clean on the two edited specs; Prettier `--check` clean on them and on this file; `verify_catalogs` clean.

**Not tested, and not claimed.** The `https` project and the browser specs outside the five named were not re-run when this was written (the schema is identical by dump); they have since been run, all green: task 0052. No hosted database was touched, and the old remote database that HANDOVER section 3 describes was not looked at. A database that already holds the old migration names was not tried when this was written (it is expected to fail: the baseline would run on tables that exist); it was tried afterwards and does fail, as expected, and leaves a failed row in `_prisma_migrations` (task 0052). The 50 originals' comments are not in the baseline; they are in git history.
