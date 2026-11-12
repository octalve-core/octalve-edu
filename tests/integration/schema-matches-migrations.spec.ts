import "../support/env";
import { test, expect } from "@playwright/test";
import { spawnSync } from "child_process";
import path from "path";
import { TEST_DATABASE_URL } from "../support/env";

// The Prisma schema describes the database the migrations build (task 0060). The test database is made by `prisma migrate deploy` in the setup project, so a diff from it to the schema is
// empty exactly when the two agree, with TWO deliberate exceptions, each something Prisma cannot say:
//   1. Five tables carry composite foreign keys on (tenantId, id) in the migrations and, on purpose, no Prisma relations (their schema files say so), so the diff lists those foreign keys
//      as "to be dropped".
//   2. `Result.verificationToken` is unique in the database as a PARTIAL index (`WHERE "verificationToken" IS NOT NULL`), which Prisma cannot read, so the diff offers a plain unique
//      index under the same name. (Applying it would fail: the name is taken. That is why the README says `migrate deploy`, not `migrate dev`.)
// Anything else fails the test: a column or an index on one side only, or a type that differs.

const UNMODELLED_FOREIGN_KEYS = ["ProgramCertificate", "PromotionBatch", "PromotionRecord", "PromotionReversal", "ReportRemark"];
const PARTIAL_UNIQUE_INDEX = 'CREATE UNIQUE INDEX "Result_verificationToken_key" ON "Result"("verificationToken")';

test("a diff from the migrated test database to the Prisma schema holds nothing but what Prisma cannot say", () => {
  const run = spawnSync(
    "pnpm",
    ["exec", "prisma", "migrate", "diff", "--from-url", TEST_DATABASE_URL, "--to-schema-datamodel", "prisma/schema", "--script"],
    { cwd: path.resolve(__dirname, "../.."), encoding: "utf-8" },
  );
  expect(run.status, `the diff itself failed: ${run.stderr.replaceAll(TEST_DATABASE_URL, "<test database>")}`).toBe(0);

  const statements = run.stdout
    .split("\n")
    .filter((line) => !line.startsWith("--") && line.trim() !== "")
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  const unmodelledKey = new RegExp(`^ALTER TABLE "(${UNMODELLED_FOREIGN_KEYS.join("|")})" DROP CONSTRAINT "[A-Za-z0-9_]+_fkey"$`);
  const drift = statements.filter((statement) => !unmodelledKey.test(statement) && statement !== PARTIAL_UNIQUE_INDEX);
  expect(drift, "the schema and the migrations disagree on:").toEqual([]);
});
