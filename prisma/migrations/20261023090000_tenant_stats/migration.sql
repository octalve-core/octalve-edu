-- Coarse per-school counters for the platform page (task 0010 F1, ADR 0016 amendment). ADDITIVE: a new table, new functions and triggers; no
-- existing row or column changes. platform_list_schools() is NOT changed - the counters come from a NEW function, so code older than this
-- migration (migrations run first) keeps working.
--
-- The platform administrator may see HOW BIG a school is without any way to read its data: four numbers per school, kept by triggers in a
-- table the runtime role cannot read, returned only by platform_school_stats() after the platform check.

CREATE TABLE "TenantStats" (
    "tenantId" TEXT NOT NULL,
    "activeMembers" INTEGER NOT NULL DEFAULT 0,
    "activeAdmins" INTEGER NOT NULL DEFAULT 0,
    "students" INTEGER NOT NULL DEFAULT 0,
    "campuses" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantStats_pkey" PRIMARY KEY ("tenantId"),
    CONSTRAINT "TenantStats_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Row-level security ON and FORCED with a policy for the table's OWNER only (the migrator, whose role also owns the SECURITY DEFINER functions
-- below): the runtime role `app_user` reads nothing, updates nothing and cannot insert - not even its own school's row. (Same lock as
-- "PlatformAuditLog"; no call to app_grant_runtime_privileges().)
ALTER TABLE "TenantStats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantStats" FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  EXECUTE format('CREATE POLICY tenant_stats_owner ON "TenantStats" FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
END
$$;

-- Adds a signed change to a school's counters. Never creates a counter row for a school that no longer exists (a school being deleted deletes
-- its people and campuses one by one, and each of those fires the triggers below after the school row is already gone).
CREATE FUNCTION tenant_stats_apply(p_tenant_id text, d_members int, d_admins int, d_students int, d_campuses int) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF d_members = 0 AND d_admins = 0 AND d_students = 0 AND d_campuses = 0 THEN
    RETURN;
  END IF;
  INSERT INTO "TenantStats" ("tenantId", "activeMembers", "activeAdmins", "students", "campuses")
    SELECT p_tenant_id, d_members, d_admins, d_students, d_campuses WHERE EXISTS (SELECT 1 FROM "Tenant" WHERE id = p_tenant_id)
  ON CONFLICT ("tenantId") DO UPDATE SET
    "activeMembers" = "TenantStats"."activeMembers" + EXCLUDED."activeMembers",
    "activeAdmins" = "TenantStats"."activeAdmins" + EXCLUDED."activeAdmins",
    "students" = "TenantStats"."students" + EXCLUDED."students",
    "campuses" = "TenantStats"."campuses" + EXCLUDED."campuses",
    "updatedAt" = now();
END
$$;

-- Repairs one school's counters from the tables themselves (the migration's backfill, and the operator's repair if a counter ever drifts). It
-- sets the school's context for the counting - the tables are under FORCE row-level security - and puts the caller's previous context back.
CREATE FUNCTION tenant_stats_recompute(p_tenant_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  previous text := current_setting('app.tenant_id', true);
  m int;
  a int;
  s int;
  c int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Tenant" WHERE id = p_tenant_id) THEN
    RETURN;
  END IF;
  PERFORM set_config('app.tenant_id', p_tenant_id, true);
  SELECT count(*) FILTER (WHERE "deactivatedAt" IS NULL)::int,
         count(*) FILTER (WHERE "deactivatedAt" IS NULL AND role = 'ADMIN')::int
    INTO m, a FROM "TenantMembership" WHERE "tenantId" = p_tenant_id;
  SELECT count(*)::int INTO s FROM "StudentRecord" WHERE "tenantId" = p_tenant_id AND "archivedAt" IS NULL;
  SELECT count(*)::int INTO c FROM "Campus" WHERE "tenantId" = p_tenant_id;
  PERFORM set_config('app.tenant_id', COALESCE(previous, ''), true);
  INSERT INTO "TenantStats" ("tenantId", "activeMembers", "activeAdmins", "students", "campuses")
    VALUES (p_tenant_id, m, a, s, c)
  ON CONFLICT ("tenantId") DO UPDATE SET
    "activeMembers" = EXCLUDED."activeMembers",
    "activeAdmins" = EXCLUDED."activeAdmins",
    "students" = EXCLUDED."students",
    "campuses" = EXCLUDED."campuses",
    "updatedAt" = now();
END
$$;

-- Neither is for the runtime role: the triggers run them as the table's owner, and an operator repairs with them. Anyone who could call
-- tenant_stats_apply could rewrite any school's numbers.
REVOKE ALL ON FUNCTION tenant_stats_apply(text, int, int, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_stats_recompute(text) FROM PUBLIC;

-- --- the triggers -----------------------------------------------------------------------------------------------------------------
-- Each applies "what the row counts now minus what it counted before", so one function serves insert, update and delete. SECURITY DEFINER so the
-- runtime role's own write is what fires them but the owner's privileges do the counting.
CREATE FUNCTION tenant_stats_from_membership() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  old_m int := 0;
  old_a int := 0;
  new_m int := 0;
  new_a int := 0;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD."deactivatedAt" IS NULL THEN
    old_m := 1;
    IF OLD.role = 'ADMIN' THEN old_a := 1; END IF;
  END IF;
  IF TG_OP <> 'DELETE' AND NEW."deactivatedAt" IS NULL THEN
    new_m := 1;
    IF NEW.role = 'ADMIN' THEN new_a := 1; END IF;
  END IF;
  PERFORM tenant_stats_apply(COALESCE(NEW."tenantId", OLD."tenantId"), new_m - old_m, new_a - old_a, 0, 0);
  RETURN NULL;
END
$$;
CREATE TRIGGER tenant_stats_membership AFTER INSERT OR DELETE OR UPDATE OF "role", "deactivatedAt" ON "TenantMembership"
  FOR EACH ROW EXECUTE FUNCTION tenant_stats_from_membership();

CREATE FUNCTION tenant_stats_from_student() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  old_s int := 0;
  new_s int := 0;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD."archivedAt" IS NULL THEN old_s := 1; END IF;
  IF TG_OP <> 'DELETE' AND NEW."archivedAt" IS NULL THEN new_s := 1; END IF;
  PERFORM tenant_stats_apply(COALESCE(NEW."tenantId", OLD."tenantId"), 0, 0, new_s - old_s, 0);
  RETURN NULL;
END
$$;
CREATE TRIGGER tenant_stats_student AFTER INSERT OR DELETE OR UPDATE OF "archivedAt" ON "StudentRecord"
  FOR EACH ROW EXECUTE FUNCTION tenant_stats_from_student();

CREATE FUNCTION tenant_stats_from_campus() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM tenant_stats_apply(NEW."tenantId", 0, 0, 0, 1);
  ELSE
    PERFORM tenant_stats_apply(OLD."tenantId", 0, 0, 0, -1);
  END IF;
  RETURN NULL;
END
$$;
CREATE TRIGGER tenant_stats_campus AFTER INSERT OR DELETE ON "Campus"
  FOR EACH ROW EXECUTE FUNCTION tenant_stats_from_campus();

-- --- the platform door --------------------------------------------------------------------------------------------------------------
-- One row per school: the school's id and the four numbers. No name, no person, no row of the school (the code and name come from
-- platform_list_schools()). A school that has no counter row yet shows zeros.
CREATE FUNCTION platform_school_stats()
RETURNS TABLE (tenant_id text, active_members int, active_admins int, students int, campuses int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
BEGIN
  PERFORM platform_assert_admin();
  RETURN QUERY SELECT t.id, COALESCE(s."activeMembers", 0), COALESCE(s."activeAdmins", 0), COALESCE(s."students", 0), COALESCE(s."campuses", 0)
    FROM "Tenant" t LEFT JOIN "TenantStats" s ON s."tenantId" = t.id ORDER BY t.id;
END
$$;

-- --- the backfill ----------------------------------------------------------------------------------------------------------------------
-- Schools that exist now are counted once, from their tables; from here on the triggers keep the numbers.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT id FROM "Tenant" LOOP
    PERFORM tenant_stats_recompute(t.id);
  END LOOP;
END
$$;
