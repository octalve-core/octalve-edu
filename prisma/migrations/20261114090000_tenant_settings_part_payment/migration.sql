-- Task 0027 slice P0 and task 0029: the generic school-and-campus settings table, and the "pay in full" flag on an invoice.
--
-- ADDITIVE ONLY: one new table (tenant-scoped, row-level security enabled and forced, composite foreign keys) and one column with a default on "Invoice". Nothing is changed or
-- dropped, and the code of the release before it keeps working. The hosted databases are migrated by the maintainer, never by an AI session.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "payInFull" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TenantSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantSetting_tenantId_campusId_idx" ON "TenantSetting"("tenantId", "campusId");

-- AddForeignKey
ALTER TABLE "TenantSetting" ADD CONSTRAINT "TenantSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSetting" ADD CONSTRAINT "TenantSetting_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES "Campus"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSetting" ADD CONSTRAINT "TenantSetting_updatedById_tenantId_fkey" FOREIGN KEY ("updatedById", "tenantId") REFERENCES "TenantMembership"("userId", "tenantId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- The key is a short dotted name; a value is a small JSON document, never a blob.
ALTER TABLE "TenantSetting" ADD CONSTRAINT "TenantSetting_key" CHECK (length("key") BETWEEN 1 AND 80 AND "key" ~ '^[a-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)+$');
ALTER TABLE "TenantSetting" ADD CONSTRAINT "TenantSetting_value_size" CHECK (pg_column_size("value") <= 4096);

-- One value per school, campus and key. "campusId" is nullable, so the school's own value is keyed on an empty string (a plain unique index would let two school rows through).
CREATE UNIQUE INDEX "TenantSetting_once" ON "TenantSetting"("tenantId", COALESCE("campusId", ''), "key");

-- Row-level security, in the same shape as the other tenant tables.
ALTER TABLE "TenantSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantSetting" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_setting_read ON "TenantSetting" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY tenant_setting_insert ON "TenantSetting" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY tenant_setting_update ON "TenantSetting" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY tenant_setting_delete ON "TenantSetting" FOR DELETE USING ("tenantId" = app_tenant_id());
