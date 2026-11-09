-- Programs, slice P5 (task 0027; AlEemaan's task 0043, section 12): completing a place or a whole fixed-term program, and certificates with a public check page.
--
-- ADDITIVE ONLY: wording, signatories and the completion rule on Program (all with safe defaults), one column on ProgramParticipant, a status enum, one table. Nothing that exists is changed, and
-- the release before this one never reads any of it, so this can be run BEFORE the code that uses it is deployed. The hosted databases are migrated by the maintainer, never by an AI session.
-- Run it after 20261120090000_program_fees.

-- CreateEnum
CREATE TYPE "ProgramCertificateStatus" AS ENUM ('ISSUED', 'REVOKED');

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "certBody" TEXT NOT NULL DEFAULT 'This is to certify that {name} has completed {program} at {school}, from {from} to {to}.',
ADD COLUMN     "certSignatories" JSONB,
ADD COLUMN     "certTitle" TEXT NOT NULL DEFAULT 'Certificate of Completion',
ADD COLUMN     "completionMinAverage" DECIMAL(5,2),
ADD COLUMN     "completionRequirePassed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "noCertWhileOwing" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProgramParticipant" ADD COLUMN     "completionOverrideReason" TEXT;

-- CreateTable
CREATE TABLE "ProgramCertificate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "serialNo" TEXT NOT NULL,
    "verificationToken" TEXT NOT NULL DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text),
    "issuedOn" DATE NOT NULL,
    "completedOn" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "programName" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "signatories" JSONB NOT NULL DEFAULT '[]',
    "status" "ProgramCertificateStatus" NOT NULL DEFAULT 'ISSUED',
    "replacesId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "revokeReason" TEXT,
    "issuedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramCertificate_tenantId_programId_participantId_idx" ON "ProgramCertificate"("tenantId", "programId", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramCertificate_tenantId_serialNo_key" ON "ProgramCertificate"("tenantId", "serialNo");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramCertificate_verificationToken_key" ON "ProgramCertificate"("verificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramCertificate_tenantId_id_key" ON "ProgramCertificate"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "ProgramCertificate" ADD CONSTRAINT "ProgramCertificate_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES "Program"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramCertificate" ADD CONSTRAINT "ProgramCertificate_tenantId_programId_participantId_fkey" FOREIGN KEY ("tenantId", "programId", "participantId") REFERENCES "ProgramParticipant"("tenantId", "programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What Prisma cannot express.
ALTER TABLE "Program" ADD CONSTRAINT "Program_certTitle_check" CHECK (char_length("certTitle") BETWEEN 1 AND 80);
ALTER TABLE "Program" ADD CONSTRAINT "Program_certBody_check" CHECK (char_length("certBody") BETWEEN 1 AND 600);
ALTER TABLE "Program" ADD CONSTRAINT "Program_certSignatories_check" CHECK ("certSignatories" IS NULL OR (jsonb_typeof("certSignatories") = 'array' AND jsonb_array_length("certSignatories") <= 2));
ALTER TABLE "Program" ADD CONSTRAINT "Program_completionMinAverage_check" CHECK ("completionMinAverage" IS NULL OR ("completionMinAverage" >= 0 AND "completionMinAverage" <= 100));
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_override_check" CHECK ("completionOverrideReason" IS NULL OR (char_length(btrim("completionOverrideReason")) BETWEEN 3 AND 500 AND "status" = 'COMPLETED'));
ALTER TABLE "ProgramCertificate" ADD CONSTRAINT "ProgramCertificate_text_check" CHECK (char_length("title") BETWEEN 1 AND 80 AND char_length("bodyText") BETWEEN 1 AND 1200 AND char_length("personName") BETWEEN 1 AND 200);
ALTER TABLE "ProgramCertificate" ADD CONSTRAINT "ProgramCertificate_token_check" CHECK ("verificationToken" ~ '^[0-9a-f]{32}$');
ALTER TABLE "ProgramCertificate" ADD CONSTRAINT "ProgramCertificate_revoked_check" CHECK (("status" = 'REVOKED') = ("revokedAt" IS NOT NULL) AND ("status" <> 'REVOKED' OR char_length(btrim(coalesce("revokeReason", ''))) >= 3));
-- At most one certificate per person and program that is in force; a withdrawn one makes room for a new one.
CREATE UNIQUE INDEX "ProgramCertificate_one_issued_key" ON "ProgramCertificate"("programId", "participantId") WHERE "status" = 'ISSUED';
-- A new certificate that replaces a withdrawn one points at it (kept within the school).
ALTER TABLE "ProgramCertificate" ADD CONSTRAINT "ProgramCertificate_replaces_fkey" FOREIGN KEY ("tenantId", "replacesId") REFERENCES "ProgramCertificate"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Row-level security on every new table, in the same shape as the other program tables.
ALTER TABLE "ProgramCertificate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramCertificate" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_certificate_read ON "ProgramCertificate" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_certificate_insert ON "ProgramCertificate" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_certificate_update ON "ProgramCertificate" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_certificate_delete ON "ProgramCertificate" FOR DELETE USING ("tenantId" = app_tenant_id());

-- Public read by the 32-character code, ISSUED and withdrawn certificates alike (a withdrawn one says so): the same shape as the school's other certificates
-- (certificate_public_verification). app_verification_token() is set by the verification context and is NULL otherwise, so no code matches nothing.
CREATE POLICY program_certificate_public_verification ON "ProgramCertificate" FOR SELECT TO app_user
    USING ("verificationToken" = app_verification_token());
