-- Promotion (task 0031; AlEemaan's tasks 0025 and 0037): rolling a class into the next session. Two append-only tables, a record of every roll and of what was decided for each pupil.
--
-- ADDITIVE ONLY: two enums, two tables and one unique index on StudentEnrollment (the target of the composite foreign keys). Nothing that exists is changed, and the release before this
-- one never reads any of it, so this can be run BEFORE the code that uses it is deployed. The hosted databases are migrated by the maintainer, never by an AI session. Run it after
-- 20261122090000_progress_records.

-- CreateEnum
CREATE TYPE "PromotionDecision" AS ENUM ('PROMOTED', 'REPEATED', 'GRADUATED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PromotionDecisionMode" AS ENUM ('AUTOMATIC', 'OVERRIDDEN');

-- CreateTable
CREATE TABLE "PromotionBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceSessionId" TEXT NOT NULL,
    "targetSessionId" TEXT NOT NULL,
    "sourceClassGroupId" TEXT NOT NULL,
    "targetClassGroupId" TEXT,
    "passMark" DECIMAL(5,2) NOT NULL,
    "totalEvaluated" INTEGER NOT NULL,
    "totalPromoted" INTEGER NOT NULL,
    "totalRepeated" INTEGER NOT NULL,
    "totalGraduated" INTEGER NOT NULL,
    "totalWithdrawn" INTEGER NOT NULL,
    "totalSkipped" INTEGER NOT NULL,
    "executedByUserId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sourceEnrollmentId" TEXT NOT NULL,
    "targetEnrollmentId" TEXT,
    "overallAverage" DECIMAL(5,2),
    "termAverages" JSONB NOT NULL,
    "decision" "PromotionDecision" NOT NULL,
    "decisionMode" "PromotionDecisionMode" NOT NULL,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentEnrollment_tenantId_id_key" ON "StudentEnrollment"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionBatch_tenantId_id_key" ON "PromotionBatch"("tenantId", "id");

-- CreateIndex
CREATE INDEX "PromotionBatch_tenantId_sourceSessionId_idx" ON "PromotionBatch"("tenantId", "sourceSessionId");

-- CreateIndex
CREATE INDEX "PromotionBatch_tenantId_targetSessionId_idx" ON "PromotionBatch"("tenantId", "targetSessionId");

-- CreateIndex
CREATE INDEX "PromotionBatch_tenantId_createdAt_idx" ON "PromotionBatch"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRecord_tenantId_batchId_studentId_key" ON "PromotionRecord"("tenantId", "batchId", "studentId");

-- CreateIndex
CREATE INDEX "PromotionRecord_tenantId_studentId_idx" ON "PromotionRecord"("tenantId", "studentId");

-- AddForeignKey
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_tenantId_sourceSessionId_fkey" FOREIGN KEY ("tenantId", "sourceSessionId") REFERENCES "AcademicSession"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_tenantId_targetSessionId_fkey" FOREIGN KEY ("tenantId", "targetSessionId") REFERENCES "AcademicSession"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_tenantId_sourceClassGroupId_fkey" FOREIGN KEY ("tenantId", "sourceClassGroupId") REFERENCES "ClassGroup"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_tenantId_targetClassGroupId_fkey" FOREIGN KEY ("tenantId", "targetClassGroupId") REFERENCES "ClassGroup"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRecord" ADD CONSTRAINT "PromotionRecord_tenantId_batchId_fkey" FOREIGN KEY ("tenantId", "batchId") REFERENCES "PromotionBatch"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRecord" ADD CONSTRAINT "PromotionRecord_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "StudentRecord"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRecord" ADD CONSTRAINT "PromotionRecord_tenantId_sourceEnrollmentId_fkey" FOREIGN KEY ("tenantId", "sourceEnrollmentId") REFERENCES "StudentEnrollment"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRecord" ADD CONSTRAINT "PromotionRecord_tenantId_targetEnrollmentId_fkey" FOREIGN KEY ("tenantId", "targetEnrollmentId") REFERENCES "StudentEnrollment"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What Prisma cannot express.
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_passMark_check" CHECK ("passMark" >= 0 AND "passMark" <= 100);
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_counts_check" CHECK (
  "totalEvaluated" >= 0 AND "totalPromoted" >= 0 AND "totalRepeated" >= 0 AND "totalGraduated" >= 0 AND "totalWithdrawn" >= 0 AND "totalSkipped" >= 0
  AND "totalPromoted" + "totalRepeated" + "totalGraduated" + "totalWithdrawn" + "totalSkipped" <= "totalEvaluated");
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_sessions_check" CHECK ("sourceSessionId" <> "targetSessionId");
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_notes_check" CHECK (coalesce(char_length("notes"), 0) <= 500);
ALTER TABLE "PromotionRecord" ADD CONSTRAINT "PromotionRecord_average_check" CHECK ("overallAverage" IS NULL OR ("overallAverage" >= 0 AND "overallAverage" <= 100));
ALTER TABLE "PromotionRecord" ADD CONSTRAINT "PromotionRecord_terms_check" CHECK (jsonb_typeof("termAverages") = 'object');
ALTER TABLE "PromotionRecord" ADD CONSTRAINT "PromotionRecord_reason_check" CHECK (coalesce(char_length("overrideReason"), 0) <= 255 AND ("decisionMode" <> 'OVERRIDDEN' OR char_length(btrim(coalesce("overrideReason", ''))) > 0));
-- A pupil who moves has a place in the target session; one who graduates or leaves has none.
ALTER TABLE "PromotionRecord" ADD CONSTRAINT "PromotionRecord_target_check" CHECK (("decision" IN ('PROMOTED', 'REPEATED')) = ("targetEnrollmentId" IS NOT NULL));

-- Row-level security on both tables, in the same shape as the other append-only tables.
ALTER TABLE "PromotionBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromotionBatch" FORCE ROW LEVEL SECURITY;
CREATE POLICY promotion_batch_read ON "PromotionBatch" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY promotion_batch_insert ON "PromotionBatch" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
ALTER TABLE "PromotionRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromotionRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY promotion_record_read ON "PromotionRecord" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY promotion_record_insert ON "PromotionRecord" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());

-- Append-only for the role the application runs as: no batch and no record is ever changed or removed.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public."PromotionBatch" FROM app_user;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public."PromotionRecord" FROM app_user;
