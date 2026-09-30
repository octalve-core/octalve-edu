-- Phase 0.5.1 — auth rebuilt against the hardened design
-- (docs/development-history/domain-implementation-plan.md §0.5.1).
--
-- 1. Session tokens are stored hashed (tokenHash), never plaintext. Any row
--    that exists under the old shape holds an un-hashable plaintext token and
--    must not survive, so every session is invalidated first. (Nothing ever
--    wrote a Session row before this phase — auth was unbuilt — so in practice
--    this deletes zero rows; it is here so the migration is safe on any DB.)
DELETE FROM "Session";

-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_userId_fkey";

-- DropIndex
DROP INDEX "Session_sessionToken_key";

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "sessionToken",
ADD COLUMN     "absoluteExpires" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "tokenHash" TEXT NOT NULL,
ADD COLUMN     "userAgent" TEXT;

-- DropTable (Auth.js OAuth accounts — never used)
DROP TABLE "Account";

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- 2. Email case-insensitivity enforced in Postgres itself, not only in
--    application code: a seed script or direct SQL import can't bypass it.
--    (Prisma's schema language cannot express CHECK constraints.)
--    Existing rows are normalized first; if two rows differ only by case this
--    UPDATE fails on the unique index, which is correct — a human must decide
--    which account survives.
UPDATE "User" SET "email" = lower("email") WHERE "email" IS NOT NULL AND "email" <> lower("email");

ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase_check" CHECK ("email" = lower("email"));
