-- The support session (task 0011 slice B, ADR 0017). ADDITIVE: two nullable columns on "Session" and one new function; nothing existing changes.
--
-- A platform administrator "opens" a school they hold a live grant for: the sign-in Session row records WHICH school and WHEN. Whether the view is
-- still allowed is decided on every request from the grant itself (platform_support_grants), never from the cookie.
ALTER TABLE "Session" ADD COLUMN "supportTenantId" TEXT, ADD COLUMN "supportOpenedAt" TIMESTAMP(3);
ALTER TABLE "Session" ADD CONSTRAINT "Session_support_pair" CHECK (("supportTenantId" IS NULL) = ("supportOpenedAt" IS NULL));
ALTER TABLE "Session" ADD CONSTRAINT "Session_supportTenantId_fkey" FOREIGN KEY ("supportTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Records one support event in BOTH logs, after proving the grant is live and the caller may use it: the school's own AuditLog (so the school
-- sees who looked at what) and the platform's PlatformAuditLog. Returns FALSE - and writes nothing - when the grant is not live for the caller
-- (revoked, expired, suspended school, addressed to someone else), which is how a revoke takes effect on the very next request.
-- p_detail is a small JSON object (method, path, area); it never carries school data.
CREATE FUNCTION platform_support_record(p_tenant_id text, p_grant_id text, p_action text, p_detail jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  uid text := platform_assert_admin();
  previous text := current_setting('app.tenant_id', true);
BEGIN
  IF p_action NOT IN ('SUPPORT_OPENED', 'SUPPORT_ACCESS', 'SUPPORT_CLOSED') THEN
    RAISE EXCEPTION 'platform_support_record: unknown action' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "SupportGrant" g JOIN "Tenant" t ON t.id = g."tenantId"
     WHERE g.id = p_grant_id AND g."tenantId" = p_tenant_id AND g."revokedAt" IS NULL AND g."expiresAt" > now() AND t."suspendedAt" IS NULL
       AND (g."granteeUserId" IS NULL OR g."granteeUserId" = uid)
  ) THEN
    RETURN false;
  END IF;
  PERFORM set_config('app.tenant_id', p_tenant_id, true);
  INSERT INTO "AuditLog" (id, "tenantId", "actorUserId", action, "targetType", "targetId", "afterValue")
    VALUES (md5(random()::text || clock_timestamp()::text), p_tenant_id, uid, p_action, 'SupportGrant', p_grant_id, p_detail);
  PERFORM set_config('app.tenant_id', COALESCE(previous, ''), true);
  INSERT INTO "PlatformAuditLog" (id, "actorUserId", action, "targetTenantId", "afterValue")
    VALUES (md5(random()::text || clock_timestamp()::text), uid, p_action, p_tenant_id, p_detail);
  RETURN true;
END
$$;
