-- Streams (task 0035): a class can say which stream it is, and a roll records which class each pupil was placed in.
--
-- ADDITIVE ONLY: two nullable columns, three constraints. Nothing that exists is changed: every class keeps `streamName` NULL ("no stream"), every earlier promotion record keeps
-- `targetClassGroupId` NULL (the batch's own target applies), and the release before this one never reads either column, so this can be run BEFORE the code that uses it is deployed.
-- The hosted databases are migrated by the maintainer, never by an AI session. Run it after 20261123090000_promotion.

-- AlterTable
ALTER TABLE "ClassGroup" ADD COLUMN "streamName" TEXT;

-- AlterTable
ALTER TABLE "PromotionRecord" ADD COLUMN "targetClassGroupId" TEXT;

-- AddForeignKey
ALTER TABLE "PromotionRecord" ADD CONSTRAINT "PromotionRecord_tenantId_targetClassGroupId_fkey" FOREIGN KEY ("tenantId", "targetClassGroupId") REFERENCES "ClassGroup"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What Prisma cannot express.
-- A stream is a trimmed name of 1 to 40 characters, or nothing.
ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_streamName_check" CHECK ("streamName" IS NULL OR (char_length("streamName") BETWEEN 1 AND 40 AND "streamName" = btrim("streamName")));
-- A class is recorded only for a pupil who moved into one (a promoted or repeating pupil has a new place; a graduate or a leaver has none).
ALTER TABLE "PromotionRecord" ADD CONSTRAINT "PromotionRecord_class_check" CHECK ("targetClassGroupId" IS NULL OR "targetEnrollmentId" IS NOT NULL);
