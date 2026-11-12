-- Programs, slice P3 (task 0027; AlEemaan's task 0043 section 10): program staff with the groups they are assigned to, sessions, the roll call, and the correction history.
--
-- ADDITIVE ONLY: two columns on Program that default to "attendance on, flag below 75%", four new tables, three unique indexes that only add a guarantee (an id is already unique on its own),
-- and constraints. Nothing that exists is changed, and the release before this one never reads any of it, so this can be run BEFORE the code that uses it is deployed. The hosted databases
-- are migrated by the maintainer, never by an AI session. Run it after 20261117100000_program_people.

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "attendanceEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lowAttendancePercent" INTEGER NOT NULL DEFAULT 75;

-- CreateTable
CREATE TABLE "ProgramStaffGroup" (
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "programStaffId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramStaffGroup_pkey" PRIMARY KEY ("programStaffId","groupId")
);

-- CreateTable
CREATE TABLE "ProgramSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramAttendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "campusId" TEXT,
    "status" "AttendanceStatus" NOT NULL,
    "remarks" TEXT,
    "markedByUserId" TEXT NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProgramAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramAttendanceChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "beforeStatus" "AttendanceStatus" NOT NULL,
    "afterStatus" "AttendanceStatus" NOT NULL,
    "beforeRemarks" TEXT,
    "afterRemarks" TEXT,
    "reason" TEXT,
    "changedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramAttendanceChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramStaffGroup_tenantId_groupId_idx" ON "ProgramStaffGroup"("tenantId", "groupId");

-- CreateIndex
CREATE INDEX "ProgramSession_tenantId_programId_date_idx" ON "ProgramSession"("tenantId", "programId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramSession_tenantId_id_key" ON "ProgramSession"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramSession_programId_groupId_date_label_key" ON "ProgramSession"("programId", "groupId", "date", "label");

-- CreateIndex
CREATE INDEX "ProgramAttendance_tenantId_programId_participantId_idx" ON "ProgramAttendance"("tenantId", "programId", "participantId");

-- CreateIndex
CREATE INDEX "ProgramAttendance_tenantId_programId_campusId_idx" ON "ProgramAttendance"("tenantId", "programId", "campusId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramAttendance_sessionId_participantId_key" ON "ProgramAttendance"("sessionId", "participantId");

-- CreateIndex
CREATE INDEX "ProgramAttendanceChange_tenantId_programId_sessionId_idx" ON "ProgramAttendanceChange"("tenantId", "programId", "sessionId");

-- CreateIndex
CREATE INDEX "ProgramAttendanceChange_tenantId_participantId_createdAt_idx" ON "ProgramAttendanceChange"("tenantId", "participantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramStaff_tenantId_programId_id_key" ON "ProgramStaff"("tenantId", "programId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramParticipant_tenantId_programId_id_key" ON "ProgramParticipant"("tenantId", "programId", "id");

-- AddForeignKey
ALTER TABLE "ProgramStaffGroup" ADD CONSTRAINT "ProgramStaffGroup_tenantId_programId_programStaffId_fkey" FOREIGN KEY ("tenantId", "programId", "programStaffId") REFERENCES "ProgramStaff"("tenantId", "programId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramStaffGroup" ADD CONSTRAINT "ProgramStaffGroup_tenantId_programId_groupId_fkey" FOREIGN KEY ("tenantId", "programId", "groupId") REFERENCES "ProgramGroup"("tenantId", "programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSession" ADD CONSTRAINT "ProgramSession_tenantId_programId_groupId_fkey" FOREIGN KEY ("tenantId", "programId", "groupId") REFERENCES "ProgramGroup"("tenantId", "programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAttendance" ADD CONSTRAINT "ProgramAttendance_tenantId_sessionId_fkey" FOREIGN KEY ("tenantId", "sessionId") REFERENCES "ProgramSession"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAttendance" ADD CONSTRAINT "ProgramAttendance_tenantId_programId_participantId_fkey" FOREIGN KEY ("tenantId", "programId", "participantId") REFERENCES "ProgramParticipant"("tenantId", "programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What Prisma cannot express.
ALTER TABLE "Program" ADD CONSTRAINT "Program_lowAttendancePercent_check" CHECK ("lowAttendancePercent" BETWEEN 1 AND 100);
ALTER TABLE "ProgramSession" ADD CONSTRAINT "ProgramSession_label_check" CHECK (char_length("label") <= 40 AND "label" = btrim("label"));
ALTER TABLE "ProgramAttendance" ADD CONSTRAINT "ProgramAttendance_remarks_check" CHECK (coalesce(char_length("remarks"), 0) <= 200);
ALTER TABLE "ProgramAttendance" ADD CONSTRAINT "ProgramAttendance_version_check" CHECK ("version" >= 1);
ALTER TABLE "ProgramAttendanceChange" ADD CONSTRAINT "ProgramAttendanceChange_reason_check" CHECK (coalesce(char_length("reason"), 0) <= 500);

-- Row-level security on every new table, in the same shape as the other program tables.
ALTER TABLE "ProgramStaffGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramStaffGroup" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_staff_group_read ON "ProgramStaffGroup" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_staff_group_insert ON "ProgramStaffGroup" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_staff_group_update ON "ProgramStaffGroup" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_staff_group_delete ON "ProgramStaffGroup" FOR DELETE USING ("tenantId" = app_tenant_id());
ALTER TABLE "ProgramSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_session_read ON "ProgramSession" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_session_insert ON "ProgramSession" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_session_update ON "ProgramSession" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_session_delete ON "ProgramSession" FOR DELETE USING ("tenantId" = app_tenant_id());
ALTER TABLE "ProgramAttendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramAttendance" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_attendance_read ON "ProgramAttendance" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_attendance_insert ON "ProgramAttendance" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_attendance_update ON "ProgramAttendance" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_attendance_delete ON "ProgramAttendance" FOR DELETE USING ("tenantId" = app_tenant_id());
ALTER TABLE "ProgramAttendanceChange" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramAttendanceChange" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_attendance_change_read ON "ProgramAttendanceChange" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_attendance_change_insert ON "ProgramAttendanceChange" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());

-- Append-only for the role the application runs as: no row of the correction history is ever changed or removed.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public."ProgramAttendanceChange" FROM app_user;
