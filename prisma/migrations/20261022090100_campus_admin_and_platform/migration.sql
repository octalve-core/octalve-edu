-- Campus administrators and the platform surface (plan C2, C5, C7; ADR 0016). ADDITIVE: no existing row changes.
-- Needs 20261022090000_campus_admin_role to have been applied (the CHECK below names the new enum value).

-- --- a campus administrator always has a campus ----------------------------------------------------------------------------
-- Existing ADMIN rows (with or without a campus) are untouched: for them `campusId` stays bookkeeping. Note the foreign key is ON DELETE
-- SET NULL: deleting a campus that has a campus administrator would now fail on this CHECK instead of silently making them school-wide
-- (there is no campus-delete feature; if one is built it must reassign or deactivate first).
ALTER TABLE "TenantMembership"
  ADD CONSTRAINT "TenantMembership_campus_admin_has_campus" CHECK (role <> 'CAMPUS_ADMIN' OR "campusId" IS NOT NULL);

-- --- the platform administrator and a suspended school ------------------------------------------------------------------------
ALTER TABLE "User" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "suspendedAt" TIMESTAMP(3);

-- --- PlatformAuditLog: not a school's data, so no tenantId and no tenant policy ------------------------------------------------
CREATE TABLE "PlatformAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetTenantId" TEXT,
    "beforeValue" JSONB,
    "afterValue" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlatformAuditLog_createdAt_idx" ON "PlatformAuditLog"("createdAt");

-- Row-level security ON and FORCED with NO policy for the runtime role: `app_user` can neither read nor write the table, whatever privileges
-- the blanket grant gave it. The table's owner (the migrator, whose role also owns the functions below) gets one explicit policy, so the
-- SECURITY DEFINER functions can append and read even when the migrator is not a superuser (FORCE applies to owners).
ALTER TABLE "PlatformAuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformAuditLog" FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  EXECUTE format('CREATE POLICY platform_audit_owner ON "PlatformAuditLog" FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
END
$$;
-- (No call to app_grant_runtime_privileges(): the default privileges already cover new tables, and the function would re-grant UPDATE and
-- DELETE on append-only tables. The lock here is the missing policy, not the missing privilege.)

-- --- the platform functions ------------------------------------------------------------------------------------------------------
-- SECURITY DEFINER, with a pinned search_path. They are the ONLY door to the platform surface. Each one: (1) requires that the person the
-- request runs as (app.user_id, set by forUser()) is a platform administrator; (2) touches only Tenant, User and PlatformAuditLog; (3)
-- writes a PlatformAuditLog row in the same transaction. They return no personal data and NO tenant-scoped row. Where one must look at a
-- school's tables (changing its type), it sets that school's context for the one statement and puts the caller's previous context back —
-- the pattern of school_settings_for_new_tenant().

CREATE FUNCTION platform_assert_admin() RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  uid text := app_user_id();
BEGIN
  IF uid IS NULL OR NOT EXISTS (SELECT 1 FROM "User" WHERE id = uid AND "isPlatformAdmin") THEN
    RAISE EXCEPTION 'platform_admin_required' USING ERRCODE = '42501';
  END IF;
  RETURN uid;
END
$$;

-- Every school, newest first: identity data only (what the code, name, type and status are) — no member counts, no campuses, no people.
CREATE FUNCTION platform_list_schools()
RETURNS TABLE (id text, code text, name text, school_type "SchoolType", created_at timestamp(3), suspended_at timestamp(3))
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  PERFORM platform_assert_admin();
  RETURN QUERY SELECT t.id, t.code, t.name, t."schoolType", t."createdAt", t."suspendedAt" FROM "Tenant" t ORDER BY t."createdAt" DESC, t.id;
END
$$;

-- A new school (the first administrator is invited by the application afterwards). The code's FORMAT and reserved words are the
-- application's job (lib/tenant/validate-code.ts); the unique index here is the backstop and a duplicate is a clean error.
CREATE FUNCTION platform_create_school(p_code text, p_name text, p_school_type "SchoolType") RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  uid text := platform_assert_admin();
  new_id text := 'p' || replace(gen_random_uuid()::text, '-', '');
  previous text := current_setting('app.tenant_id', true);
BEGIN
  IF p_code IS NULL OR p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'platform_invalid_input' USING ERRCODE = '22023';
  END IF;
  -- The tenant row's trigger creates the school's settings row, which is under FORCE row-level security: the new school's context is set
  -- for this insert only.
  PERFORM set_config('app.tenant_id', new_id, true);
  INSERT INTO "Tenant" (id, code, name, "schoolType") VALUES (new_id, p_code, trim(p_name), p_school_type);
  PERFORM set_config('app.tenant_id', COALESCE(previous, ''), true);
  INSERT INTO "PlatformAuditLog" (id, "actorUserId", action, "targetTenantId", "afterValue")
    VALUES ('p' || replace(gen_random_uuid()::text, '-', ''), uid, 'SCHOOL_CREATED', new_id,
            jsonb_build_object('code', p_code, 'name', trim(p_name), 'schoolType', p_school_type));
  RETURN new_id;
END
$$;

-- Changes a school's type — refused once it has any academic period (a school that already runs terms must not be stranded on another
-- kind; ADR 0010). Returns false when there is no such school.
CREATE FUNCTION platform_set_school_type(p_tenant_id text, p_school_type "SchoolType") RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  uid text := platform_assert_admin();
  old_type "SchoolType";
  previous text := current_setting('app.tenant_id', true);
  periods int;
BEGIN
  SELECT "schoolType" INTO old_type FROM "Tenant" WHERE id = p_tenant_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF old_type = p_school_type THEN RETURN true; END IF;
  PERFORM set_config('app.tenant_id', p_tenant_id, true);
  SELECT count(*) INTO periods FROM "AcademicPeriod" WHERE "tenantId" = p_tenant_id;
  PERFORM set_config('app.tenant_id', COALESCE(previous, ''), true);
  IF periods > 0 THEN
    RAISE EXCEPTION 'platform_school_has_periods' USING ERRCODE = '23514';
  END IF;
  UPDATE "Tenant" SET "schoolType" = p_school_type WHERE id = p_tenant_id;
  INSERT INTO "PlatformAuditLog" (id, "actorUserId", action, "targetTenantId", "beforeValue", "afterValue")
    VALUES ('p' || replace(gen_random_uuid()::text, '-', ''), uid, 'SCHOOL_TYPE_CHANGED', p_tenant_id,
            jsonb_build_object('schoolType', old_type), jsonb_build_object('schoolType', p_school_type));
  RETURN true;
END
$$;

-- Suspends or reinstates a school. Idempotent (doing it twice writes one audit row). A reason is required to suspend. Returns false when
-- there is no such school.
CREATE FUNCTION platform_set_school_suspended(p_tenant_id text, p_suspended boolean, p_reason text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  uid text := platform_assert_admin();
  was timestamp(3);
BEGIN
  IF p_suspended AND (p_reason IS NULL OR length(trim(p_reason)) = 0) THEN
    RAISE EXCEPTION 'platform_reason_required' USING ERRCODE = '22023';
  END IF;
  SELECT "suspendedAt" INTO was FROM "Tenant" WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF (was IS NOT NULL) = p_suspended THEN RETURN true; END IF;
  UPDATE "Tenant" SET "suspendedAt" = CASE WHEN p_suspended THEN now() ELSE NULL END WHERE id = p_tenant_id;
  INSERT INTO "PlatformAuditLog" (id, "actorUserId", action, "targetTenantId", "reason")
    VALUES ('p' || replace(gen_random_uuid()::text, '-', ''), uid,
            CASE WHEN p_suspended THEN 'SCHOOL_SUSPENDED' ELSE 'SCHOOL_REINSTATED' END, p_tenant_id, NULLIF(trim(p_reason), ''));
  RETURN true;
END
$$;

-- The platform's own history, newest first.
CREATE FUNCTION platform_list_audit(p_limit int)
RETURNS TABLE (id text, actor_user_id text, action text, target_tenant_id text, reason text, created_at timestamp(3))
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  PERFORM platform_assert_admin();
  RETURN QUERY SELECT a.id, a."actorUserId", a.action, a."targetTenantId", a.reason, a."createdAt"
    FROM "PlatformAuditLog" a ORDER BY a."createdAt" DESC, a.id LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
END
$$;
