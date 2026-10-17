-- Phase 2 — Communication & Multi-Channel Messaging Engine
-- ADDITIVE ONLY. RLS policies and runtime privilege locks ship in this same file.

-- CreateEnum: NotificationChannel
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'IN_APP');

-- CreateEnum: NotificationDispatchStatus
CREATE TYPE "NotificationDispatchStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'RETRYING');

-- CreateTable: NotificationTemplate
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "subjectTemplate" TEXT,
    "bodyTemplate" TEXT NOT NULL,
    "variables" JSONB,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable: NotificationDispatch
CREATE TABLE "NotificationDispatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "status" "NotificationDispatchStatus" NOT NULL DEFAULT 'QUEUED',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable: GuardianLinkToken
CREATE TABLE "GuardianLinkToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "action" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardianLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable: NotificationAuditLog
CREATE TABLE "NotificationAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dispatchId" TEXT,
    "actorUserId" TEXT,
    "event" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationAuditLog_pkey" PRIMARY KEY ("id")
);

-- Unique Indexes
CREATE UNIQUE INDEX "NotificationTemplate_tenantId_id_key" ON "NotificationTemplate"("tenantId", "id");
CREATE UNIQUE INDEX "NotificationTemplate_tenantId_code_channel_key" ON "NotificationTemplate"("tenantId", "code", "channel");
CREATE UNIQUE INDEX "NotificationDispatch_tenantId_id_key" ON "NotificationDispatch"("tenantId", "id");
CREATE UNIQUE INDEX "GuardianLinkToken_tenantId_id_key" ON "GuardianLinkToken"("tenantId", "id");
CREATE UNIQUE INDEX "GuardianLinkToken_tenantId_tokenHash_key" ON "GuardianLinkToken"("tenantId", "tokenHash");
CREATE UNIQUE INDEX "NotificationAuditLog_tenantId_id_key" ON "NotificationAuditLog"("tenantId", "id");

-- Performance Indexes
CREATE INDEX "NotificationTemplate_tenantId_channel_idx" ON "NotificationTemplate"("tenantId", "channel");
CREATE INDEX "NotificationTemplate_tenantId_code_idx" ON "NotificationTemplate"("tenantId", "code");
CREATE INDEX "NotificationDispatch_tenantId_status_idx" ON "NotificationDispatch"("tenantId", "status");
CREATE INDEX "NotificationDispatch_tenantId_channel_idx" ON "NotificationDispatch"("tenantId", "channel");
CREATE INDEX "NotificationDispatch_tenantId_createdAt_idx" ON "NotificationDispatch"("tenantId", "createdAt");
CREATE INDEX "GuardianLinkToken_tenantId_studentId_idx" ON "GuardianLinkToken"("tenantId", "studentId");
CREATE INDEX "GuardianLinkToken_tenantId_expiresAt_idx" ON "GuardianLinkToken"("tenantId", "expiresAt");
CREATE INDEX "NotificationAuditLog_tenantId_event_idx" ON "NotificationAuditLog"("tenantId", "event");
CREATE INDEX "NotificationAuditLog_tenantId_createdAt_idx" ON "NotificationAuditLog"("tenantId", "createdAt");

-- Foreign Keys
ALTER TABLE "NotificationTemplate" ADD CONSTRAINT "NotificationTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationDispatch" ADD CONSTRAINT "NotificationDispatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDispatch" ADD CONSTRAINT "NotificationDispatch_tenantId_templateId_fkey" FOREIGN KEY ("tenantId", "templateId") REFERENCES "NotificationTemplate"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "NotificationDispatch" ADD CONSTRAINT "NotificationDispatch_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuardianLinkToken" ADD CONSTRAINT "GuardianLinkToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuardianLinkToken" ADD CONSTRAINT "GuardianLinkToken_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "StudentRecord"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuardianLinkToken" ADD CONSTRAINT "GuardianLinkToken_tenantId_guardianId_fkey" FOREIGN KEY ("tenantId", "guardianId") REFERENCES "GuardianRecord"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "NotificationAuditLog" ADD CONSTRAINT "NotificationAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security: NotificationTemplate
ALTER TABLE "NotificationTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationTemplate" FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_template_tenant_isolation ON "NotificationTemplate" FOR ALL TO app_user
    USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

-- Row-Level Security: NotificationDispatch
ALTER TABLE "NotificationDispatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationDispatch" FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_dispatch_tenant_isolation ON "NotificationDispatch" FOR ALL TO app_user
    USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

-- Row-Level Security: GuardianLinkToken
ALTER TABLE "GuardianLinkToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuardianLinkToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY guardian_link_token_tenant_isolation ON "GuardianLinkToken" FOR ALL TO app_user
    USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

-- Row-Level Security: NotificationAuditLog
ALTER TABLE "NotificationAuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationAuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_audit_log_tenant_isolation ON "NotificationAuditLog" FOR ALL TO app_user
    USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

-- Owner policies for background queues / migrator
DO $$
BEGIN
  EXECUTE format('CREATE POLICY notification_template_owner ON "NotificationTemplate" FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
  EXECUTE format('CREATE POLICY notification_dispatch_owner ON "NotificationDispatch" FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
  EXECUTE format('CREATE POLICY guardian_link_token_owner ON "GuardianLinkToken" FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
  EXECUTE format('CREATE POLICY notification_audit_log_owner ON "NotificationAuditLog" FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
END
$$;

-- NotificationAuditLog is append-only for runtime role app_user
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public."NotificationAuditLog" FROM app_user;
