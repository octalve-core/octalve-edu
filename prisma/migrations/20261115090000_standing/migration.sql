-- Standing (task 0028, the Octalve Edu port of AlEemaan's task 0045): suspension, expulsion and termination on the school's own records.
--
-- ADDITIVE ONLY: three new enums, one enum value (EnrollmentStatus EXPELLED), six new columns that all default to "nothing happened" (ACTIVE, no end date), and one new table with
-- row-level security. No row is changed, and the release before this one never reads any of it, so this can be run BEFORE the code that uses it is deployed. The hosted databases are
-- migrated by the maintainer, never by an AI session.
--
-- What Prisma cannot express is added at the end: checks that keep a standing sensible even if a caller forgets to (a pupil is never "terminated", a member of staff is never
-- "expelled", only a suspension has an end date), row-level security, and the revoke that makes the history append-only for the application's own database role.

-- CreateEnum
CREATE TYPE "StandingState" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPELLED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "StandingSubject" AS ENUM ('STUDENT', 'STAFF');

-- CreateEnum
CREATE TYPE "StandingEventAction" AS ENUM ('SUSPENDED', 'EXPELLED', 'TERMINATED', 'LIFTED', 'REINSTATED');

-- AlterEnum
ALTER TYPE "EnrollmentStatus" ADD VALUE 'EXPELLED';

-- AlterTable
ALTER TABLE "StudentRecord" ADD COLUMN "standing" "StandingState" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "standingUntil" DATE;

-- AlterTable
ALTER TABLE "StaffRecord" ADD COLUMN "standing" "StandingState" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "standingUntil" DATE;

-- AlterTable
ALTER TABLE "TenantMembership" ADD COLUMN "standing" "StandingState" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "standingUntil" DATE;

-- CreateTable
CREATE TABLE "StandingEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subject" "StandingSubject" NOT NULL,
    "studentId" TEXT,
    "staffRecordId" TEXT,
    "memberUserId" TEXT,
    "campusId" TEXT,
    "action" "StandingEventAction" NOT NULL,
    "reason" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "decidedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StandingEvent_tenantId_studentId_createdAt_idx" ON "StandingEvent"("tenantId", "studentId", "createdAt");
CREATE INDEX "StandingEvent_tenantId_staffRecordId_createdAt_idx" ON "StandingEvent"("tenantId", "staffRecordId", "createdAt");
CREATE INDEX "StandingEvent_tenantId_memberUserId_createdAt_idx" ON "StandingEvent"("tenantId", "memberUserId", "createdAt");
CREATE INDEX "StandingEvent_tenantId_campusId_createdAt_idx" ON "StandingEvent"("tenantId", "campusId", "createdAt");

-- AddForeignKey
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "StudentRecord"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_tenantId_staffRecordId_fkey" FOREIGN KEY ("tenantId", "staffRecordId") REFERENCES "StaffRecord"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- A pupil is active, suspended or expelled; a member of staff (and a membership) is active, suspended or terminated; only a suspension has an end date.
ALTER TABLE "StudentRecord" ADD CONSTRAINT "StudentRecord_standing_check" CHECK ("standing" IN ('ACTIVE', 'SUSPENDED', 'EXPELLED') AND ("standingUntil" IS NULL OR "standing" = 'SUSPENDED'));
ALTER TABLE "StaffRecord" ADD CONSTRAINT "StaffRecord_standing_check" CHECK ("standing" IN ('ACTIVE', 'SUSPENDED', 'TERMINATED') AND ("standingUntil" IS NULL OR "standing" = 'SUSPENDED'));
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_standing_check" CHECK ("standing" IN ('ACTIVE', 'SUSPENDED', 'TERMINATED') AND ("standingUntil" IS NULL OR "standing" = 'SUSPENDED'));

-- The history: a reason of 3 to 500 characters, a subject that matches the ids it carries, and an action that fits its subject.
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_reason_check" CHECK (char_length("reason") BETWEEN 3 AND 500);
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_subject_check" CHECK (
  ("subject" = 'STUDENT' AND "studentId" IS NOT NULL AND "staffRecordId" IS NULL AND "memberUserId" IS NULL)
  OR ("subject" = 'STAFF' AND "studentId" IS NULL AND ("staffRecordId" IS NOT NULL OR "memberUserId" IS NOT NULL))
);
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_action_check" CHECK (("action" <> 'EXPELLED' OR "subject" = 'STUDENT') AND ("action" <> 'TERMINATED' OR "subject" = 'STAFF'));

-- Row-level security, in the same shape as the other tenant tables. Read and insert only: the policies for update and delete do not exist, and the privileges are revoked below.
ALTER TABLE "StandingEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StandingEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY standing_event_read ON "StandingEvent" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY standing_event_insert ON "StandingEvent" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());

-- Append-only for the role the application runs as: no row of the history is ever changed or removed by the application.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public."StandingEvent" FROM app_user;
