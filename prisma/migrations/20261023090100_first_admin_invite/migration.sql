-- Re-invite a school's first administrator (task 0010 F2, ISS-0015, ADR 0016 amendment). ADDITIVE: one new function.
--
-- A school made from the platform page gets ONE invitation for its first administrator, by email. If that mail is lost nobody inside the school
-- exists to send another, and the platform may not look inside. This is the narrow door: it checks the caller is a platform administrator, looks
-- inside THIS school for one statement to see whether it has an active ADMIN, REFUSES if it has one, and otherwise writes the platform's audit
-- row (with the address) and returns true. The application then revokes the school's open ADMIN invitations and writes the new one in the same
-- transaction (so a failure there rolls this audit row back too).
--
-- The check is a LIVE count, not the TenantStats counter: the counter informs the page, it must not authorise anything.
-- Returns false when there is no such school. Raises platform_school_has_admin when the school already has an administrator.
CREATE FUNCTION platform_authorize_first_admin_invite(p_tenant_id text, p_email text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  uid text := platform_assert_admin();
  previous text := current_setting('app.tenant_id', true);
  admins int;
BEGIN
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'platform_invalid_input' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Tenant" WHERE id = p_tenant_id) THEN
    RETURN false;
  END IF;
  PERFORM set_config('app.tenant_id', p_tenant_id, true);
  SELECT count(*)::int INTO admins FROM "TenantMembership" WHERE "tenantId" = p_tenant_id AND role = 'ADMIN' AND "deactivatedAt" IS NULL;
  PERFORM set_config('app.tenant_id', COALESCE(previous, ''), true);
  IF admins > 0 THEN
    RAISE EXCEPTION 'platform_school_has_admin' USING ERRCODE = '23514';
  END IF;
  INSERT INTO "PlatformAuditLog" (id, "actorUserId", action, "targetTenantId", "afterValue")
    VALUES ('p' || replace(gen_random_uuid()::text, '-', ''), uid, 'FIRST_ADMIN_REINVITED', p_tenant_id,
            jsonb_build_object('email', lower(trim(p_email))));
  RETURN true;
END
$$;
