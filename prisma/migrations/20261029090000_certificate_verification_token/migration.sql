-- Certificates: a public verification token, and numbers that are unique within a school instead of across all schools.
--
-- Run it BEFORE the code that issues and verifies certificates by token is deployed. The code of the release before it keeps working against this
-- schema: a certificate it issues still gets a token (the column has a default), and it looks certificates up by number with findFirst.
--
-- Nothing is lost: every existing certificate is given a token, and the new uniqueness (school + number) is weaker than the old one (number alone),
-- so no existing row can violate it.

-- 1. The token: 32 hex characters from the database's own random source (gen_random_uuid is built in from PostgreSQL 13). The default is volatile, so
--    each existing row is given its own value as the column is added.
ALTER TABLE "Certificate"
    ADD COLUMN "verificationToken" TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');

CREATE UNIQUE INDEX "Certificate_verificationToken_key" ON "Certificate"("verificationToken");

-- 2. The number is unique within a school. Two schools may each issue "OCT-VOC-2026-00001": the first used to block every other school.
DROP INDEX "Certificate_certificateNo_key";
CREATE UNIQUE INDEX "Certificate_tenantId_certificateNo_key" ON "Certificate"("tenantId", "certificateNo");

-- 3. Public read by token, ISSUED certificates only: the same shape as result_read for a published result (app_verification_token() is set by the
--    verification context and is NULL otherwise, so no token matches nothing). Permissive policies are OR-ed with certificate_tenant_isolation.
CREATE POLICY certificate_public_verification ON "Certificate" FOR SELECT TO app_user
    USING ("verificationToken" = app_verification_token() AND "status" = 'ISSUED');
