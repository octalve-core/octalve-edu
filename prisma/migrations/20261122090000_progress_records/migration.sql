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
