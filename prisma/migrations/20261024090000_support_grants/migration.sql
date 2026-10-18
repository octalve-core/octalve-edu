-- Audited support access, slice A: the school's grant (task 0011, ADR 0017). ADDITIVE: a new table, trigger and functions; nothing existing changes.
--
-- A SupportGrant is a row in the SCHOOL's own data. A school ADMIN creates one (the application checks that); the database keeps it honest: only the
-- grantable areas (finance is not one), at most 24 hours, and from then on the row can only be REVOKED - nothing else may be edited and it is never
-- deleted. `granteeUserId` is reserved for "a named platform administrator"; in this version a grant is open to any platform administrator (null).

CREATE TABLE "SupportGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "granteeUserId" TEXT,
    "areas" TEXT[] NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportGrant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SupportGrant_areas_grantable" CHECK (
      cardinality("areas") > 0 AND "areas" <@ ARRAY['settings', 'academics', 'people', 'attendance', 'results']::text[]
    ),
    CONSTRAINT "SupportGrant_reason_given" CHECK (length(btrim("reason")) > 0),
    CONSTRAINT "SupportGrant_expiry_window" CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + interval '24 hours'),
    CONSTRAINT "SupportGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupportGrant_granteeUserId_fkey" FOREIGN KEY ("granteeUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupportGrant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "SupportGrant_tenantId_createdAt_idx" ON "SupportGrant"("tenantId", "createdAt");

-- Row-level security: the school reads, creates and revokes its own grants; there is NO delete policy. The owner (the migrator, whose role owns the
-- SECURITY DEFINER functions) has its own policy so platform_support_grants() can read every school's LIVE grants without switching school context.
ALTER TABLE "SupportGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportGrant" FORCE ROW LEVEL SECURITY;
CREATE POLICY support_grant_read ON "SupportGrant" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY support_grant_insert ON "SupportGrant" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY support_grant_update ON "SupportGrant" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
DO $$
BEGIN
  EXECUTE format('CREATE POLICY support_grant_owner ON "SupportGrant" FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
END
$$;

-- Append-and-revoke only: the one permitted change is setting revokedAt, once.
CREATE FUNCTION support_grant_guard() RETURNS trigger LANGUAGE plpgsql AS
$$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."granteeUserId" IS DISTINCT FROM OLD."granteeUserId"
     OR NEW."areas" IS DISTINCT FROM OLD."areas" OR NEW."reason" IS DISTINCT FROM OLD."reason" OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt") THEN
    RAISE EXCEPTION 'support_grant_immutable: a support grant can only be revoked' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER support_grant_guard BEFORE UPDATE ON "SupportGrant" FOR EACH ROW EXECUTE FUNCTION support_grant_guard();

-- The platform's door: the LIVE grants a platform administrator may use - not expired, not revoked, school not suspended, addressed to them or to anyone.
-- School, grant id, areas and expiry: no reason text, no people, nothing else.
CREATE FUNCTION platform_support_grants()
RETURNS TABLE (tenant_id text, grant_id text, areas text[], expires_at timestamp(3))
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  uid text := platform_assert_admin();
BEGIN
  RETURN QUERY
    SELECT g."tenantId", g.id, g.areas, g."expiresAt"
      FROM "SupportGrant" g JOIN "Tenant" t ON t.id = g."tenantId"
     WHERE g."revokedAt" IS NULL AND g."expiresAt" > now() AND t."suspendedAt" IS NULL AND (g."granteeUserId" IS NULL OR g."granteeUserId" = uid)
     ORDER BY g."expiresAt";
END
$$;
