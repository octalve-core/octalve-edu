-- Undoing a promotion (task 0040): a roll that was a mistake is taken back as a NEW recorded fact, never by editing the roll.
--
-- ADDITIVE ONLY: one value on the enrolment status, one append-only table. Nothing that exists is changed, and the release before this one never reads either, so this can be run BEFORE the
-- code that uses it is deployed. The hosted databases are migrated by the maintainer, never by an AI session. Run it after 20261125090000_report_remarks.

-- AlterEnum
-- A promotion's new placement cannot be deleted (a promotion record points at it with a restricting key, and the record is append-only), and "withdrawn" would say a pupil left a class they never
-- joined. CANCELLED means exactly "the roll that placed this pupil here was undone". Everything that selects pupils by an ACTIVE enrolment already ignores it.
ALTER TYPE "EnrollmentStatus" ADD VALUE 'CANCELLED';

-- CreateTable
CREATE TABLE "PromotionReversal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "reversedByUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "restored" INTEGER NOT NULL,
    "cancelled" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionReversal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One undo per roll: a second is refused by the database itself, whatever the application does.
CREATE UNIQUE INDEX "PromotionReversal_tenantId_batchId_key" ON "PromotionReversal"("tenantId", "batchId");

-- CreateIndex
CREATE INDEX "PromotionReversal_tenantId_createdAt_idx" ON "PromotionReversal"("tenantId", "createdAt");

-- AddForeignKey
-- The roll that was undone: a composite key, so a reversal can never point at another school's roll.
ALTER TABLE "PromotionReversal" ADD CONSTRAINT "PromotionReversal_tenantId_batchId_fkey" FOREIGN KEY ("tenantId", "batchId") REFERENCES "PromotionBatch"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A reason of 1 to 500 characters that is not only spaces, and counts that make sense (every pupil whose placement was cancelled was also put back where they came from).
ALTER TABLE "PromotionReversal" ADD CONSTRAINT "PromotionReversal_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500);
ALTER TABLE "PromotionReversal" ADD CONSTRAINT "PromotionReversal_counts_check" CHECK ("restored" >= 0 AND "cancelled" >= 0 AND "cancelled" <= "restored");

-- Row-level security, in the same shape as the other append-only tables.
ALTER TABLE "PromotionReversal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromotionReversal" FORCE ROW LEVEL SECURITY;
CREATE POLICY promotion_reversal_read ON "PromotionReversal" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY promotion_reversal_insert ON "PromotionReversal" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());

-- Append-only for the role the application runs as: an undo is never changed or removed.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public."PromotionReversal" FROM app_user;
