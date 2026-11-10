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
