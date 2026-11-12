# 0060: A test now fails when the Prisma schema and the migrations differ in any way Prisma cannot say; the README's `migrate dev` was a trap

- **Period / Focus:** 2026-11-12 (found with `prisma migrate diff` while checking AlEemaan's migration of task 0066; the maintainer asked for the flaws and gaps to be fixed. AlEemaan's task 0068 is the same guard)
- **Status:** Done
- **Priority:** Low to Medium (no wrong data: but `prisma migrate dev`, the README's setup command, would offer a migration that drops fourteen foreign keys, and another that cannot be applied)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-schema-matches-migrations` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

`prisma migrate diff --from-url <migrated test database> --to-schema-datamodel prisma/schema` on `origin/dev` reports six tables. Read properly, it holds **two things Prisma cannot say, and one real inconsistency**:

1. **Fourteen composite foreign keys that the schema does not model, on purpose.** `ProgramCertificate` (1), `PromotionBatch` (4), `PromotionRecord` (5), `PromotionReversal` (1) and `ReportRemark` (3) carry foreign keys on `(tenantId, id)` in the migrations; their schema files say they carry "no Prisma relations" (a row can never point at another school's class or pupil, enforced by the database). The diff reads them as "to be dropped".
2. **`Result.verificationToken` is unique in the database as a PARTIAL index** (`... WHERE "verificationToken" IS NOT NULL`), which Prisma cannot read, so the diff offers a plain `CREATE UNIQUE INDEX "Result_verificationToken_key"`. The name is taken, so that statement would FAIL when applied (`relation already exists`, which is exactly what my own first migration for it did: see section 4).
3. **A real, small inconsistency: the schema declared `@@index([verificationToken])`** on `Result`, an index the database does not have (the partial unique index already serves the lookup, and keeping two would be waste). Removed from the schema.

**A wrong first reading, corrected (2026-11-12):** from the diff alone I concluded that the database had no unique index and no index on `Result.verificationToken`, so the public report-card check scanned the table, and I wrote a migration for it. That was wrong: the partial unique index was there (Prisma's blind spot is the partial predicate), uniqueness is enforced and the lookup is indexed. Running my migration is what showed it (`relation "Result_verificationToken_key" already exists`). The migration was withdrawn before anything was committed; nothing about it reached a pull request or a hosted database. The earlier message that said otherwise was wrong.

The hazard that remains: the README's setup command is `pnpm prisma migrate dev`, which would offer a migration dropping the fourteen foreign keys and creating the index that already exists.

## 2. Decisions (mine; the maintainer may correct)

- **D1. No migration.** The database is right; the schema loses one redundant `@@index` line (the diff then holds nothing but 1 and 2).
- **D2. The guard:** `tests/integration/schema-matches-migrations.spec.ts` renders the diff from the migrated test database as SQL and fails on any statement that is not one of: a `DROP CONSTRAINT ..._fkey` on the five tables of item 1, or the one `CREATE UNIQUE INDEX "Result_verificationToken_key"` of item 2. A column or an index on one side only, or a type that differs, fails it.
- **D3. The README says `pnpm prisma migrate deploy`** (applies the committed migrations only) with the reason; a new migration is written by hand or from `prisma migrate diff --script` with the allowed statements removed.
- **D4. Not changed:** modelling the fourteen foreign keys in the schema (relation fields and inverse fields on a dozen models for no change in behaviour).

## 3. Work breakdown

- [x] Design (this file, rewritten after the wrong first reading).
- [x] The test first (see section 4).
- [x] The schema line removed; the README corrected.
- [x] The test passes; `prisma generate`, `tsc --noEmit` (exit 0) and eslint unchanged.
- [x] Docs: the tracker, the HANDOVER (6.32).

## 4. Build record and tests

Octalve lane 1 (`TEST_LANE=1`: ports +10, database `octalve_edu_lane1_test`), a production build in the lane directory first.

- **Run 1, the first version of the spec (no allowance for the partial index), unfixed schema: 1 failed, 1 passed (setup).** The report listed `CREATE UNIQUE INDEX "Result_verificationToken_key"` and `CREATE INDEX "Result_verificationToken_idx"` (the fourteen allowed foreign keys were not listed).
- **My wrong migration, run 2:** `migrate deploy` failed in the setup (`P3018`, `relation "Result_verificationToken_key" already exists`, SQL state 42P07). The failed migration left a failed record in that lane's test database, which blocks every later `migrate deploy` there; the lane's own throwaway test database `octalve_edu_lane1_test` was dropped (admin role, nothing connected) and rebuilt by the setup. Querying `pg_indexes` showed the partial index.
- **Run 3, the corrected spec on the unfixed schema (with `@@index`), on the rebuilt database: 1 failed, 1 passed.** Only `CREATE INDEX "Result_verificationToken_idx"` was reported.
- **Run 4, the schema line removed: 2 passed, 0 failed** (setup and the spec). `prisma generate` ran; `tsc --noEmit` exit 0; eslint on the spec exit 0; Prettier clean on the spec and the README.
- **Not run:** the whole suite (no application code and no migration changed); mutation passes (deferred).
