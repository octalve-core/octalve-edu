-- One migration made from six (task 0049, 2026-11-11).
--
-- This file is the six migrations below, in this order, unchanged, each under a banner:
--   20261122090000_progress_records   (task 0030: progress records)
--   20261123090000_promotion          (task 0031: promoting a class, result sheets)
--   20261124090000_streams            (task 0035: streams)
--   20261125090000_report_remarks     (task 0036: the teacher's and the principal's remark)
--   20261126090000_promotion_undo     (task 0040: undoing a roll)
--   20261127090000_exam_name          (task 0048: a school's own name for the exam part, the locked-scheme trigger)
-- They had been written to wait for the maintainer to run them on a hosted database, in order. There is no hosted database yet (no production, no preview), so nothing has applied them and
-- they are merged into one. An applied migration is never edited; this one may be only because nothing applied the six. Do not do this again once a hosted database exists.
--
-- The comments inside each section still say "run it after ..." and describe the older migrations; they are kept as the reason each statement exists, and they are history now.
-- Postgres rule to keep in mind: the section from 20261126090000 adds a value to the enum "EnrollmentStatus" ('CANCELLED'). A new enum value cannot be USED in the same transaction that adds it
-- (and a migration file runs as one), so never add a statement to this file that uses 'CANCELLED'; put it in a later migration.

-- =====================================================================================================================================
-- From 20261122090000_progress_records
-- =====================================================================================================================================

-- Progress records (task 0027, slices R1 to R4; AlEemaan's task 0044): a running log a teacher keeps for each person in a program - templates, records, dated entries with their revisions, the lock
-- on an entry while it is edited, and what pupils and guardians have seen.
--
-- ADDITIVE ONLY: settings on Program (all with safe defaults), three enums, six tables. Nothing that exists is changed, and the release before this one never reads any of it, so this can be run
-- BEFORE the code that uses it is deployed. The hosted databases are migrated by the maintainer, never by an AI session. Run it after 20261121090000_program_completion.

-- CreateEnum
CREATE TYPE "ProgressEntryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "ProgressWriters" AS ENUM ('TEACHERS', 'ASSIGNED', 'BOTH');

-- CreateEnum
CREATE TYPE "ProgressGuardianDetail" AS ENUM ('SUMMARY', 'FULL');

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "progressEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "progressFourEyes" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "progressGuardianDetail" "ProgressGuardianDetail" NOT NULL DEFAULT 'SUMMARY',
ADD COLUMN     "progressGuardianView" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "progressHijriAdjust" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "progressLockInactivity" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "progressLockRelease" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "progressRequireVerification" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "progressStudentView" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "progressTemplate" TEXT,
ADD COLUMN     "progressWriters" "ProgressWriters" NOT NULL DEFAULT 'BOTH';

-- CreateTable
CREATE TABLE "ProgressTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "schema" JSONB NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "profile" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "trackKey" TEXT NOT NULL,
    "entryDate" DATE NOT NULL,
    "values" JSONB NOT NULL,
    "status" "ProgressEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "lastEditedByUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "verifiedByUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "returnComment" TEXT,
    "publishedValues" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressEntryRevision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "beforeValues" JSONB,
    "afterValues" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressEntryRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressLock" (
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "holderUserId" TEXT NOT NULL,
    "heartbeatAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releaseAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressLock_pkey" PRIMARY KEY ("entryId")
);

-- CreateTable
CREATE TABLE "ProgressSeen" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressSeen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgressTemplate_programId_key_version_key" ON "ProgressTemplate"("programId", "key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressTemplate_tenantId_id_key" ON "ProgressTemplate"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressTemplate_tenantId_programId_id_key" ON "ProgressTemplate"("tenantId", "programId", "id");

-- CreateIndex
CREATE INDEX "ProgressRecord_tenantId_programId_idx" ON "ProgressRecord"("tenantId", "programId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressRecord_programId_participantId_key" ON "ProgressRecord"("programId", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressRecord_tenantId_programId_participantId_key" ON "ProgressRecord"("tenantId", "programId", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressRecord_tenantId_id_key" ON "ProgressRecord"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressRecord_tenantId_programId_id_key" ON "ProgressRecord"("tenantId", "programId", "id");

-- CreateIndex
CREATE INDEX "ProgressEntry_tenantId_recordId_trackKey_entryDate_idx" ON "ProgressEntry"("tenantId", "recordId", "trackKey", "entryDate");

-- CreateIndex
CREATE INDEX "ProgressEntry_tenantId_programId_status_idx" ON "ProgressEntry"("tenantId", "programId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressEntry_tenantId_id_key" ON "ProgressEntry"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressEntry_tenantId_programId_id_key" ON "ProgressEntry"("tenantId", "programId", "id");

-- CreateIndex
CREATE INDEX "ProgressEntryRevision_tenantId_entryId_createdAt_idx" ON "ProgressEntryRevision"("tenantId", "entryId", "createdAt");

-- CreateIndex
CREATE INDEX "ProgressEntryRevision_tenantId_programId_createdAt_idx" ON "ProgressEntryRevision"("tenantId", "programId", "createdAt");

-- CreateIndex
CREATE INDEX "ProgressLock_expiresAt_idx" ON "ProgressLock"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressLock_tenantId_programId_entryId_key" ON "ProgressLock"("tenantId", "programId", "entryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressSeen_recordId_actor_weekStart_key" ON "ProgressSeen"("recordId", "actor", "weekStart");

-- AddForeignKey
ALTER TABLE "ProgressTemplate" ADD CONSTRAINT "ProgressTemplate_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES "Program"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressRecord" ADD CONSTRAINT "ProgressRecord_tenantId_programId_participantId_fkey" FOREIGN KEY ("tenantId", "programId", "participantId") REFERENCES "ProgramParticipant"("tenantId", "programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressRecord" ADD CONSTRAINT "ProgressRecord_tenantId_programId_templateId_fkey" FOREIGN KEY ("tenantId", "programId", "templateId") REFERENCES "ProgressTemplate"("tenantId", "programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_tenantId_programId_recordId_fkey" FOREIGN KEY ("tenantId", "programId", "recordId") REFERENCES "ProgressRecord"("tenantId", "programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressLock" ADD CONSTRAINT "ProgressLock_tenantId_programId_entryId_fkey" FOREIGN KEY ("tenantId", "programId", "entryId") REFERENCES "ProgressEntry"("tenantId", "programId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressSeen" ADD CONSTRAINT "ProgressSeen_tenantId_programId_recordId_fkey" FOREIGN KEY ("tenantId", "programId", "recordId") REFERENCES "ProgressRecord"("tenantId", "programId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- What Prisma cannot express.
ALTER TABLE "Program" ADD CONSTRAINT "Program_progressLockInactivity_check" CHECK ("progressLockInactivity" BETWEEN 60 AND 3600);
ALTER TABLE "Program" ADD CONSTRAINT "Program_progressLockRelease_check" CHECK ("progressLockRelease" BETWEEN 0 AND 300);
ALTER TABLE "Program" ADD CONSTRAINT "Program_progressHijriAdjust_check" CHECK ("progressHijriAdjust" BETWEEN -2 AND 2);
ALTER TABLE "ProgressTemplate" ADD CONSTRAINT "ProgressTemplate_key_check" CHECK (char_length("key") BETWEEN 1 AND 40 AND "version" >= 1 AND jsonb_typeof("schema") = 'object');
ALTER TABLE "ProgressRecord" ADD CONSTRAINT "ProgressRecord_profile_check" CHECK (jsonb_typeof("profile") = 'object' AND "version" >= 1);
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_values_check" CHECK (jsonb_typeof("values") = 'object' AND char_length("trackKey") BETWEEN 1 AND 40 AND "version" >= 1);
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_return_check" CHECK (coalesce(char_length("returnComment"), 0) <= 300);
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_verified_check" CHECK ("status" <> 'VERIFIED' OR ("publishedValues" IS NOT NULL AND "verifiedAt" IS NOT NULL AND "verifiedByUserId" IS NOT NULL));
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_published_check" CHECK ("publishedValues" IS NULL OR jsonb_typeof("publishedValues") = 'object');
ALTER TABLE "ProgressEntryRevision" ADD CONSTRAINT "ProgressEntryRevision_note_check" CHECK (coalesce(char_length("note"), 0) <= 300 AND char_length("action") BETWEEN 1 AND 30);
ALTER TABLE "ProgressLock" ADD CONSTRAINT "ProgressLock_times_check" CHECK ("expiresAt" >= "heartbeatAt" AND ("releaseAt" IS NULL OR "releaseAt" >= "heartbeatAt"));
ALTER TABLE "ProgressSeen" ADD CONSTRAINT "ProgressSeen_actor_check" CHECK ("actor" IN ('PUPIL', 'GUARDIAN'));

-- Row-level security on every new table, in the same shape as the other program tables.
ALTER TABLE "ProgressTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgressTemplate" FORCE ROW LEVEL SECURITY;
CREATE POLICY progress_template_read ON "ProgressTemplate" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY progress_template_insert ON "ProgressTemplate" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
ALTER TABLE "ProgressRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgressRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY progress_record_read ON "ProgressRecord" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY progress_record_insert ON "ProgressRecord" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY progress_record_update ON "ProgressRecord" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY progress_record_delete ON "ProgressRecord" FOR DELETE USING ("tenantId" = app_tenant_id());
ALTER TABLE "ProgressEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgressEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY progress_entry_read ON "ProgressEntry" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY progress_entry_insert ON "ProgressEntry" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY progress_entry_update ON "ProgressEntry" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY progress_entry_delete ON "ProgressEntry" FOR DELETE USING ("tenantId" = app_tenant_id());
ALTER TABLE "ProgressEntryRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgressEntryRevision" FORCE ROW LEVEL SECURITY;
CREATE POLICY progress_entry_revision_read ON "ProgressEntryRevision" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY progress_entry_revision_insert ON "ProgressEntryRevision" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
ALTER TABLE "ProgressLock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgressLock" FORCE ROW LEVEL SECURITY;
CREATE POLICY progress_lock_read ON "ProgressLock" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY progress_lock_insert ON "ProgressLock" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY progress_lock_update ON "ProgressLock" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY progress_lock_delete ON "ProgressLock" FOR DELETE USING ("tenantId" = app_tenant_id());
ALTER TABLE "ProgressSeen" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgressSeen" FORCE ROW LEVEL SECURITY;
CREATE POLICY progress_seen_read ON "ProgressSeen" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY progress_seen_insert ON "ProgressSeen" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY progress_seen_update ON "ProgressSeen" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY progress_seen_delete ON "ProgressSeen" FOR DELETE USING ("tenantId" = app_tenant_id());

-- Append-only for the role the application runs as: no row of these histories is ever changed or removed.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public."ProgressTemplate" FROM app_user;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public."ProgressEntryRevision" FROM app_user;

-- =====================================================================================================================================
-- From 20261123090000_promotion
-- =====================================================================================================================================

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

-- =====================================================================================================================================
-- From 20261124090000_streams
-- =====================================================================================================================================

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

-- =====================================================================================================================================
-- From 20261125090000_report_remarks
-- =====================================================================================================================================

-- Report remarks (task 0036): the teacher's and the principal's remark on a pupil's report card for one term.
--
-- ADDITIVE ONLY: one new table (tenant-scoped, row-level security enabled and forced, composite foreign keys). Nothing that exists is changed, and the release before this one never reads it, so
-- this can be run BEFORE the code that uses it is deployed. The hosted databases are migrated by the maintainer, never by an AI session. Run it after 20261124090000_streams.

-- CreateTable
CREATE TABLE "ReportRemark" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "teacherRemark" TEXT,
    "teacherRemarkByUserId" TEXT,
    "principalRemark" TEXT,
    "principalRemarkByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportRemark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportRemark_tenantId_studentId_periodId_key" ON "ReportRemark"("tenantId", "studentId", "periodId");

-- CreateIndex
CREATE INDEX "ReportRemark_tenantId_periodId_idx" ON "ReportRemark"("tenantId", "periodId");

-- AddForeignKey
ALTER TABLE "ReportRemark" ADD CONSTRAINT "ReportRemark_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRemark" ADD CONSTRAINT "ReportRemark_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "StudentRecord"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRemark" ADD CONSTRAINT "ReportRemark_tenantId_periodId_fkey" FOREIGN KEY ("tenantId", "periodId") REFERENCES "AcademicPeriod"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- What Prisma cannot express.
-- A row exists only to hold a remark: with both cleared the application deletes it.
ALTER TABLE "ReportRemark" ADD CONSTRAINT "ReportRemark_present_check" CHECK ("teacherRemark" IS NOT NULL OR "principalRemark" IS NOT NULL);
-- A remark is real text of 1 to 500 characters (the application trims and refuses anything else; this is the second wall).
ALTER TABLE "ReportRemark" ADD CONSTRAINT "ReportRemark_teacher_check" CHECK ("teacherRemark" IS NULL OR (char_length("teacherRemark") <= 500 AND char_length(btrim("teacherRemark")) > 0));
ALTER TABLE "ReportRemark" ADD CONSTRAINT "ReportRemark_principal_check" CHECK ("principalRemark" IS NULL OR (char_length("principalRemark") <= 500 AND char_length(btrim("principalRemark")) > 0));
-- Who wrote a remark is recorded with it, and only with it.
ALTER TABLE "ReportRemark" ADD CONSTRAINT "ReportRemark_authors_check" CHECK (("teacherRemark" IS NULL) = ("teacherRemarkByUserId" IS NULL) AND ("principalRemark" IS NULL) = ("principalRemarkByUserId" IS NULL));

-- Row-level security, in the same shape as the other mutable tenant tables.
ALTER TABLE "ReportRemark" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReportRemark" FORCE ROW LEVEL SECURITY;
CREATE POLICY report_remark_read ON "ReportRemark" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY report_remark_insert ON "ReportRemark" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY report_remark_update ON "ReportRemark" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY report_remark_delete ON "ReportRemark" FOR DELETE USING ("tenantId" = app_tenant_id());

-- =====================================================================================================================================
-- From 20261126090000_promotion_undo
-- =====================================================================================================================================

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

-- =====================================================================================================================================
-- From 20261127090000_exam_name
-- =====================================================================================================================================

-- Task 0048 (decision of the maintainer on the 0032 points, 2026-11-11): a school names the exam part of its assessment scheme.
--
-- Until now the exam part of a mark was always called "Exam" (or "Final exam", "Examination", "Exam 2"... when a component already took the name). A school can now name it ("Final Examination",
-- "Endterm"). The column is NULLABLE and has no default: null means "the default name", so every scheme that exists keeps the parts it had and every saved result keeps matching its scheme.
--
-- ADDITIVE ONLY: one nullable column, one check constraint on a column that is null everywhere, and the locked-scheme guard replaced by a copy that also protects the new column. Nothing is
-- dropped, renamed, backfilled or rewritten. Safe to run before or after the code that uses it is deployed (the old code ignores the column; the new code reads null as "Exam").

ALTER TABLE "AssessmentScheme" ADD COLUMN "examName" TEXT;

-- 1 to 40 characters once trimmed, the same bound as a component's name. (The application also collapses runs of whitespace and refuses a name that a component already has.)
ALTER TABLE "AssessmentScheme"
  ADD CONSTRAINT "AssessmentScheme_examName_length" CHECK ("examName" IS NULL OR char_length(btrim("examName")) BETWEEN 1 AND 40);

-- A locked scheme (a result references it) keeps its name, totals, exam name, version, scope and lock forever; only archiving (archivedAt) and updatedAt may change. The same function as before with
-- "examName" added to the protected fields; IS DISTINCT FROM treats null as a value, so null -> "Endterm" is a change and null -> null is not.
CREATE OR REPLACE FUNCTION assessment_scheme_locked_guard() RETURNS trigger LANGUAGE plpgsql AS
$$
BEGIN
  IF OLD."lockedAt" IS NOT NULL AND (NEW."name", NEW."totalMax", NEW."examMax", NEW."examName", NEW."version", NEW."classGroupId", NEW."supersedesId", NEW."lockedAt")
     IS DISTINCT FROM (OLD."name", OLD."totalMax", OLD."examMax", OLD."examName", OLD."version", OLD."classGroupId", OLD."supersedesId", OLD."lockedAt") THEN
    RAISE EXCEPTION 'assessment scheme % is locked: a change is a new version', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

