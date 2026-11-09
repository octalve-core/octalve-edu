-- Programs, slice P1 (task 0027): the structure. Additive: new enums and tables only, nothing existing is changed.

-- CreateEnum
CREATE TYPE "ProgramKind" AS ENUM ('ONGOING', 'FIXED_TERM');

-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProgramStaffRole" AS ENUM ('ADMIN', 'SUPERVISOR', 'TEACHER', 'RECORDER');

-- CreateEnum
CREATE TYPE "ProgramStaffStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "ProgramKind" NOT NULL,
    "status" "ProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "startsOn" DATE,
    "endsOn" DATE,
    "createdByUserId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramCampus" (
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramCampus_pkey" PRIMARY KEY ("programId","campusId")
);

-- CreateTable
CREATE TABLE "ProgramLevelLabel" (
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "levelIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ProgramLevelLabel_pkey" PRIMARY KEY ("programId","levelIndex")
);

-- CreateTable
CREATE TABLE "ProgramGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "parentId" TEXT,
    "levelIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramStaff" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProgramStaffRole" NOT NULL,
    "status" "ProgramStaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ProgramStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramAudit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "beforeValue" JSONB,
    "afterValue" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Program_tenantId_status_idx" ON "Program"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Program_tenantId_id_key" ON "Program"("tenantId", "id");

-- CreateIndex
CREATE INDEX "ProgramCampus_tenantId_campusId_idx" ON "ProgramCampus"("tenantId", "campusId");

-- CreateIndex
CREATE INDEX "ProgramLevelLabel_tenantId_idx" ON "ProgramLevelLabel"("tenantId");

-- CreateIndex
CREATE INDEX "ProgramGroup_tenantId_programId_parentId_idx" ON "ProgramGroup"("tenantId", "programId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramGroup_tenantId_id_key" ON "ProgramGroup"("tenantId", "id");

-- CreateIndex
CREATE INDEX "ProgramStaff_tenantId_userId_status_idx" ON "ProgramStaff"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "ProgramStaff_tenantId_programId_status_idx" ON "ProgramStaff"("tenantId", "programId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramStaff_programId_userId_role_key" ON "ProgramStaff"("programId", "userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramStaff_tenantId_id_key" ON "ProgramStaff"("tenantId", "id");

-- CreateIndex
CREATE INDEX "ProgramAudit_tenantId_programId_createdAt_idx" ON "ProgramAudit"("tenantId", "programId", "createdAt");

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramCampus" ADD CONSTRAINT "ProgramCampus_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES "Program"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramCampus" ADD CONSTRAINT "ProgramCampus_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES "Campus"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramLevelLabel" ADD CONSTRAINT "ProgramLevelLabel_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES "Program"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramGroup" ADD CONSTRAINT "ProgramGroup_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES "Program"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramGroup" ADD CONSTRAINT "ProgramGroup_tenantId_parentId_fkey" FOREIGN KEY ("tenantId", "parentId") REFERENCES "ProgramGroup"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramStaff" ADD CONSTRAINT "ProgramStaff_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES "Program"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramStaff" ADD CONSTRAINT "ProgramStaff_userId_tenantId_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES "TenantMembership"("userId", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAudit" ADD CONSTRAINT "ProgramAudit_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES "Program"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A program's name is unique among the school's live (not archived) programs, ignoring case; a group's name is unique among its live siblings. Prisma cannot express a partial,
-- case-insensitive index, so they are here (the services check first and answer in words; these are the last word when two requests race).
CREATE UNIQUE INDEX "Program_live_name_key" ON "Program" ("tenantId", lower("name")) WHERE "status" <> 'ARCHIVED';
CREATE UNIQUE INDEX "ProgramGroup_live_name_key" ON "ProgramGroup" ("tenantId", "programId", COALESCE("parentId", ''), lower("name")) WHERE "archivedAt" IS NULL;

-- Levels are 0 to 3 (at most four names); a top group has no parent and every other group has one; a fixed-term program has both dates in order and an ongoing one has no end date.
ALTER TABLE "ProgramLevelLabel" ADD CONSTRAINT "ProgramLevelLabel_level_check" CHECK ("levelIndex" BETWEEN 0 AND 3);
ALTER TABLE "ProgramGroup" ADD CONSTRAINT "ProgramGroup_level_check" CHECK ("levelIndex" BETWEEN 0 AND 3);
ALTER TABLE "ProgramGroup" ADD CONSTRAINT "ProgramGroup_top_has_no_parent_check" CHECK (("parentId" IS NULL) = ("levelIndex" = 0));
ALTER TABLE "Program" ADD CONSTRAINT "Program_dates_check" CHECK (
  ("kind" = 'FIXED_TERM' AND "startsOn" IS NOT NULL AND "endsOn" IS NOT NULL AND "endsOn" > "startsOn")
  OR ("kind" = 'ONGOING' AND "endsOn" IS NULL)
);

-- Row-level security, in the same shape as the other tenant tables.
ALTER TABLE "Program" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Program" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_read ON "Program" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_insert ON "Program" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_update ON "Program" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_delete ON "Program" FOR DELETE USING ("tenantId" = app_tenant_id());

ALTER TABLE "ProgramCampus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramCampus" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_campus_read ON "ProgramCampus" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_campus_insert ON "ProgramCampus" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_campus_update ON "ProgramCampus" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_campus_delete ON "ProgramCampus" FOR DELETE USING ("tenantId" = app_tenant_id());

ALTER TABLE "ProgramLevelLabel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramLevelLabel" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_level_label_read ON "ProgramLevelLabel" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_level_label_insert ON "ProgramLevelLabel" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_level_label_update ON "ProgramLevelLabel" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_level_label_delete ON "ProgramLevelLabel" FOR DELETE USING ("tenantId" = app_tenant_id());

ALTER TABLE "ProgramGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramGroup" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_group_read ON "ProgramGroup" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_group_insert ON "ProgramGroup" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_group_update ON "ProgramGroup" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_group_delete ON "ProgramGroup" FOR DELETE USING ("tenantId" = app_tenant_id());

ALTER TABLE "ProgramStaff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramStaff" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_staff_read ON "ProgramStaff" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_staff_insert ON "ProgramStaff" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_staff_update ON "ProgramStaff" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_staff_delete ON "ProgramStaff" FOR DELETE USING ("tenantId" = app_tenant_id());

-- The audit: read and insert only. The policies for update and delete do not exist and the privileges are revoked, so "append-only" is the database's rule and not only the code's.
ALTER TABLE "ProgramAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramAudit" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_audit_read ON "ProgramAudit" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_audit_insert ON "ProgramAudit" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public."ProgramAudit" FROM app_user;
