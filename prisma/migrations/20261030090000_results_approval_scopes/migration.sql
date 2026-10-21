-- Results are approved by assignment (ADR 0018, slice 1): sections, a class group's optional section, and where each approver approves. ADDITIVE: two tables, one
-- enum and one nullable column; nothing existing changes except that every current holder of CAN_APPROVE_RESULTS is given a GENERAL scope on their own campus
-- (below), so nobody's behaviour changes on the day this runs. The maintainer runs it on the hosted database BEFORE the code that reads it is deployed there.
--
-- Section: a named group of class groups of one campus (Primary, JSS, SSS). Archived, never deleted: class groups and scopes point at it.
-- ResultApprovalScope: one row says "this person approves results for GENERAL (their whole campus), a SECTION, or one CLASS group". Rows are added and removed,
-- never edited. No row means no approving (the application fails closed).

-- CreateEnum
CREATE TYPE "ApprovalScopeKind" AS ENUM ('GENERAL', 'SECTION', 'CLASS');

-- AlterTable
ALTER TABLE "ClassGroup" ADD COLUMN     "sectionId" TEXT;

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultApprovalScope" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ApprovalScopeKind" NOT NULL,
    "sectionId" TEXT,
    "classGroupId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultApprovalScope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Section_tenantId_idx" ON "Section"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Section_tenantId_id_key" ON "Section"("tenantId", "id");

-- CreateIndex
CREATE INDEX "ResultApprovalScope_tenantId_userId_idx" ON "ResultApprovalScope"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "ClassGroup_tenantId_sectionId_idx" ON "ClassGroup"("tenantId", "sectionId");

-- AddForeignKey
ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_tenantId_sectionId_fkey" FOREIGN KEY ("tenantId", "sectionId") REFERENCES "Section"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES "Campus"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultApprovalScope" ADD CONSTRAINT "ResultApprovalScope_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultApprovalScope" ADD CONSTRAINT "ResultApprovalScope_userId_tenantId_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES "TenantMembership"("userId", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultApprovalScope" ADD CONSTRAINT "ResultApprovalScope_tenantId_sectionId_fkey" FOREIGN KEY ("tenantId", "sectionId") REFERENCES "Section"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultApprovalScope" ADD CONSTRAINT "ResultApprovalScope_tenantId_classGroupId_fkey" FOREIGN KEY ("tenantId", "classGroupId") REFERENCES "ClassGroup"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- What the schema file cannot say. A section needs a name; a live name is unique within its campus ('' = the school-wide sections of a school without campuses).
ALTER TABLE "Section" ADD CONSTRAINT "Section_name_given" CHECK (length(btrim("name")) BETWEEN 1 AND 80);
CREATE UNIQUE INDEX "Section_live_name_key" ON "Section" ("tenantId", COALESCE("campusId", ''), lower("name")) WHERE "archivedAt" IS NULL;

-- A scope's kind and its target agree: GENERAL names nothing, SECTION names a section, CLASS names a class group. The same person cannot hold the same scope twice.
ALTER TABLE "ResultApprovalScope" ADD CONSTRAINT "ResultApprovalScope_kind_target" CHECK (
  ("kind" = 'GENERAL' AND "sectionId" IS NULL AND "classGroupId" IS NULL)
  OR ("kind" = 'SECTION' AND "sectionId" IS NOT NULL AND "classGroupId" IS NULL)
  OR ("kind" = 'CLASS' AND "classGroupId" IS NOT NULL AND "sectionId" IS NULL)
);
CREATE UNIQUE INDEX "ResultApprovalScope_target_key" ON "ResultApprovalScope" ("tenantId", "userId", "kind", COALESCE("sectionId", ''), COALESCE("classGroupId", ''));

-- Nothing changes on the day this runs: everyone who holds CAN_APPROVE_RESULTS today approves for their whole campus (the school, for a membership with no campus),
-- which is exactly a GENERAL scope. Done before row-level security is switched on, so the migrator can write the rows.
INSERT INTO "ResultApprovalScope" ("id", "tenantId", "userId", "kind")
SELECT 'a' || replace(gen_random_uuid()::text, '-', ''), "tenantId", "userId", 'GENERAL'::"ApprovalScopeKind"
  FROM "TenantMembership"
 WHERE 'CAN_APPROVE_RESULTS'::"Permission" = ANY ("permissions");

-- Row-level security, as on every school table. Sections are read, created and edited (renamed, archived) by their school and never deleted; scopes are read,
-- created and deleted and never edited (a change of scope is a delete and an insert, which is also how it is audited).
ALTER TABLE "Section" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Section" FORCE ROW LEVEL SECURITY;
CREATE POLICY section_read ON "Section" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY section_insert ON "Section" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY section_update ON "Section" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "ResultApprovalScope" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResultApprovalScope" FORCE ROW LEVEL SECURITY;
CREATE POLICY result_approval_scope_read ON "ResultApprovalScope" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY result_approval_scope_insert ON "ResultApprovalScope" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY result_approval_scope_delete ON "ResultApprovalScope" FOR DELETE USING ("tenantId" = app_tenant_id());
