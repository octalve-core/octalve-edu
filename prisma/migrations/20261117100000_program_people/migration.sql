-- Programs, slice P2 (task 0027, section 7; AlEemaan's task 0043 section 9): the people of a program, step 2 of 2 (step 1 is 20261117090000_standing_participant_subject).
--
-- ADDITIVE ONLY: two enums, one table, one nullable column on StandingEvent, a unique index on ProgramGroup that only adds a guarantee (a group id is already unique on its own), and
-- constraints that keep the new table sensible even if a caller forgets to. The one pair of constraints that is replaced (StandingEvent_subject_check, StandingEvent_action_check) is made
-- WIDER, and every row that exists satisfies the new ones. Nothing here is read by the release before it, so this can be run before the code that uses it is deployed.

-- CreateEnum
CREATE TYPE "ParticipantKind" AS ENUM ('STUDENT', 'STAFF', 'GUARDIAN', 'ADULT', 'CHILD');

-- CreateEnum
CREATE TYPE "ProgramPlaceStatus" AS ENUM ('ACTIVE', 'WITHDRAWN', 'COMPLETED');

-- AlterTable
ALTER TABLE "StandingEvent" ADD COLUMN     "participantId" TEXT;

-- CreateTable
CREATE TABLE "ProgramParticipant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "kind" "ParticipantKind" NOT NULL,
    "studentId" TEXT,
    "staffRecordId" TEXT,
    "guardianId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "gender" "Gender",
    "dateOfBirth" DATE,
    "phone" TEXT,
    "email" TEXT,
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "groupId" TEXT NOT NULL,
    "campusId" TEXT,
    "status" "ProgramPlaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedOn" DATE NOT NULL,
    "endedOn" DATE,
    "endedReason" TEXT,
    "standing" "StandingState" NOT NULL DEFAULT 'ACTIVE',
    "standingUntil" DATE,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramParticipant_tenantId_programId_status_idx" ON "ProgramParticipant"("tenantId", "programId", "status");

-- CreateIndex
CREATE INDEX "ProgramParticipant_tenantId_programId_groupId_idx" ON "ProgramParticipant"("tenantId", "programId", "groupId");

-- CreateIndex
CREATE INDEX "ProgramParticipant_tenantId_programId_campusId_idx" ON "ProgramParticipant"("tenantId", "programId", "campusId");

-- CreateIndex
CREATE INDEX "ProgramParticipant_tenantId_studentId_idx" ON "ProgramParticipant"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "ProgramParticipant_tenantId_staffRecordId_idx" ON "ProgramParticipant"("tenantId", "staffRecordId");

-- CreateIndex
CREATE INDEX "ProgramParticipant_tenantId_guardianId_idx" ON "ProgramParticipant"("tenantId", "guardianId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramParticipant_tenantId_id_key" ON "ProgramParticipant"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramParticipant_programId_studentId_key" ON "ProgramParticipant"("programId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramParticipant_programId_staffRecordId_key" ON "ProgramParticipant"("programId", "staffRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramParticipant_programId_guardianId_key" ON "ProgramParticipant"("programId", "guardianId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramGroup_tenantId_programId_id_key" ON "ProgramGroup"("tenantId", "programId", "id");

-- CreateIndex
CREATE INDEX "StandingEvent_tenantId_participantId_createdAt_idx" ON "StandingEvent"("tenantId", "participantId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES "Program"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_tenantId_programId_groupId_fkey" FOREIGN KEY ("tenantId", "programId", "groupId") REFERENCES "ProgramGroup"("tenantId", "programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES "Campus"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "StudentRecord"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_tenantId_staffRecordId_fkey" FOREIGN KEY ("tenantId", "staffRecordId") REFERENCES "StaffRecord"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_tenantId_guardianId_fkey" FOREIGN KEY ("tenantId", "guardianId") REFERENCES "GuardianRecord"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- What Prisma cannot express. A pupil, a member of staff and a guardian are LINKED (their name and birth date live on the school's record, so none are copied here); an adult and a child are
-- typed in and need a first and a last name; a child also needs a birth date and a guardian's name and phone (a NULL passes a CHECK, so each is tested with coalesce).
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_kind_check" CHECK (
  ("kind" = 'STUDENT' AND "studentId" IS NOT NULL AND "staffRecordId" IS NULL AND "guardianId" IS NULL
     AND "firstName" IS NULL AND "lastName" IS NULL AND "gender" IS NULL AND "dateOfBirth" IS NULL AND "phone" IS NULL AND "email" IS NULL AND "guardianName" IS NULL AND "guardianPhone" IS NULL)
  OR ("kind" = 'STAFF' AND "staffRecordId" IS NOT NULL AND "studentId" IS NULL AND "guardianId" IS NULL
     AND "firstName" IS NULL AND "lastName" IS NULL AND "gender" IS NULL AND "dateOfBirth" IS NULL AND "phone" IS NULL AND "email" IS NULL AND "guardianName" IS NULL AND "guardianPhone" IS NULL)
  OR ("kind" = 'GUARDIAN' AND "guardianId" IS NOT NULL AND "studentId" IS NULL AND "staffRecordId" IS NULL
     AND "firstName" IS NULL AND "lastName" IS NULL AND "gender" IS NULL AND "dateOfBirth" IS NULL AND "phone" IS NULL AND "email" IS NULL AND "guardianName" IS NULL AND "guardianPhone" IS NULL)
  OR ("kind" IN ('ADULT', 'CHILD') AND "studentId" IS NULL AND "staffRecordId" IS NULL AND "guardianId" IS NULL
     AND coalesce(char_length(btrim("firstName")), 0) > 0 AND coalesce(char_length(btrim("lastName")), 0) > 0)
);
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_child_check" CHECK (
  "kind" <> 'CHILD' OR ("dateOfBirth" IS NOT NULL AND coalesce(char_length(btrim("guardianName")), 0) > 0 AND coalesce(char_length(btrim("guardianPhone")), 0) > 0)
);
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_length_check" CHECK (
  coalesce(char_length("firstName"), 0) <= 60 AND coalesce(char_length("lastName"), 0) <= 60 AND coalesce(char_length("phone"), 0) <= 30
  AND coalesce(char_length("guardianPhone"), 0) <= 30 AND coalesce(char_length("email"), 0) <= 120 AND coalesce(char_length("guardianName"), 0) <= 120
  AND coalesce(char_length("endedReason"), 0) <= 500
);
-- Standing on the row itself counts only for a person typed in (a linked person's standing lives on the school's record and nowhere else); such a person is active, suspended or expelled,
-- and only a suspension has an end date.
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_standing_check" CHECK (
  "standing" IN ('ACTIVE', 'SUSPENDED', 'EXPELLED') AND ("standingUntil" IS NULL OR "standing" = 'SUSPENDED')
  AND ("kind" IN ('ADULT', 'CHILD') OR ("standing" = 'ACTIVE' AND "standingUntil" IS NULL))
);
-- A place that is still active has not ended, and an end is never before the start.
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_dates_check" CHECK (
  ("endedOn" IS NULL OR "endedOn" >= "joinedOn") AND ("status" <> 'ACTIVE' OR "endedOn" IS NULL)
);

-- The history of standing gains the subject PARTICIPANT (no foreign key, like the rest of it: the history outlives what it is about).
ALTER TABLE "StandingEvent" DROP CONSTRAINT "StandingEvent_subject_check";
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_subject_check" CHECK (
  ("subject" = 'STUDENT' AND "studentId" IS NOT NULL AND "staffRecordId" IS NULL AND "memberUserId" IS NULL AND "participantId" IS NULL)
  OR ("subject" = 'STAFF' AND "studentId" IS NULL AND ("staffRecordId" IS NOT NULL OR "memberUserId" IS NOT NULL) AND "participantId" IS NULL)
  OR ("subject" = 'PARTICIPANT' AND "participantId" IS NOT NULL AND "studentId" IS NULL AND "staffRecordId" IS NULL AND "memberUserId" IS NULL)
);
ALTER TABLE "StandingEvent" DROP CONSTRAINT "StandingEvent_action_check";
ALTER TABLE "StandingEvent" ADD CONSTRAINT "StandingEvent_action_check" CHECK (
  ("action" <> 'EXPELLED' OR "subject" IN ('STUDENT', 'PARTICIPANT')) AND ("action" <> 'TERMINATED' OR "subject" = 'STAFF')
);

-- Row-level security, in the same shape as the other program tables.
ALTER TABLE "ProgramParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramParticipant" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_participant_read ON "ProgramParticipant" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_participant_insert ON "ProgramParticipant" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_participant_update ON "ProgramParticipant" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_participant_delete ON "ProgramParticipant" FOR DELETE USING ("tenantId" = app_tenant_id());
