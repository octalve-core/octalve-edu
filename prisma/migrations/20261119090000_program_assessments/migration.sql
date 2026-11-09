-- Programs, slice P3b (task 0027; AlEemaan's task 0043, section 8.11): assessments of a program - a dated sitting with a maximum, scores for the people in the groups it is given to, optional grade
-- bands, and an append-only history of every score.
--
-- ADDITIVE ONLY: two columns on Program (the program's own switch, default OFF, and the grade bands), two enums, four tables, unique indexes that only add a guarantee. Nothing that exists is
-- changed, and the release before this one never reads any of it, so this can be run BEFORE the code that uses it is deployed. The hosted databases are migrated by the maintainer, never by an AI
-- session. Run it after 20261118090000_program_attendance.

-- CreateEnum
CREATE TYPE "ProgramAssessmentStatus" AS ENUM ('DRAFT', 'OPEN', 'MARKED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProgramScoreCode" AS ENUM ('ABSENT', 'EXCUSED', 'EXEMPT', 'NOT_SITTING');

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "assessmentsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gradeBands" JSONB;

-- CreateTable
CREATE TABLE "ProgramAssessment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT '',
    "date" DATE NOT NULL,
    "maxScore" DECIMAL(7,2) NOT NULL,
    "passMark" DECIMAL(7,2),
    "weight" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProgramAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ProgramAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramAssessmentGroup" (
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "ProgramAssessmentGroup_pkey" PRIMARY KEY ("assessmentId","groupId")
);

-- CreateTable
CREATE TABLE "ProgramScore" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "campusId" TEXT,
    "score" DECIMAL(7,2),
    "code" "ProgramScoreCode",
    "comment" TEXT,
    "markedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProgramScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramScoreChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "beforeScore" DECIMAL(7,2),
    "beforeCode" "ProgramScoreCode",
    "afterScore" DECIMAL(7,2),
    "afterCode" "ProgramScoreCode",
    "reason" TEXT,
    "changedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramScoreChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramAssessment_tenantId_programId_status_idx" ON "ProgramAssessment"("tenantId", "programId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramAssessment_tenantId_id_key" ON "ProgramAssessment"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramAssessment_tenantId_programId_id_key" ON "ProgramAssessment"("tenantId", "programId", "id");

-- CreateIndex
CREATE INDEX "ProgramAssessmentGroup_tenantId_groupId_idx" ON "ProgramAssessmentGroup"("tenantId", "groupId");

-- CreateIndex
CREATE INDEX "ProgramScore_tenantId_programId_participantId_idx" ON "ProgramScore"("tenantId", "programId", "participantId");

-- CreateIndex
CREATE INDEX "ProgramScore_tenantId_programId_campusId_idx" ON "ProgramScore"("tenantId", "programId", "campusId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramScore_assessmentId_participantId_key" ON "ProgramScore"("assessmentId", "participantId");

-- CreateIndex
CREATE INDEX "ProgramScoreChange_tenantId_programId_assessmentId_idx" ON "ProgramScoreChange"("tenantId", "programId", "assessmentId");

-- CreateIndex
CREATE INDEX "ProgramScoreChange_tenantId_participantId_createdAt_idx" ON "ProgramScoreChange"("tenantId", "participantId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProgramAssessment" ADD CONSTRAINT "ProgramAssessment_tenantId_programId_fkey" FOREIGN KEY ("tenantId", "programId") REFERENCES "Program"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAssessmentGroup" ADD CONSTRAINT "ProgramAssessmentGroup_tenantId_programId_assessmentId_fkey" FOREIGN KEY ("tenantId", "programId", "assessmentId") REFERENCES "ProgramAssessment"("tenantId", "programId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAssessmentGroup" ADD CONSTRAINT "ProgramAssessmentGroup_tenantId_programId_groupId_fkey" FOREIGN KEY ("tenantId", "programId", "groupId") REFERENCES "ProgramGroup"("tenantId", "programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramScore" ADD CONSTRAINT "ProgramScore_tenantId_programId_assessmentId_fkey" FOREIGN KEY ("tenantId", "programId", "assessmentId") REFERENCES "ProgramAssessment"("tenantId", "programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramScore" ADD CONSTRAINT "ProgramScore_tenantId_programId_participantId_fkey" FOREIGN KEY ("tenantId", "programId", "participantId") REFERENCES "ProgramParticipant"("tenantId", "programId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What Prisma cannot express.
ALTER TABLE "ProgramAssessment" ADD CONSTRAINT "ProgramAssessment_title_check" CHECK (char_length("title") BETWEEN 1 AND 120 AND "title" = btrim("title"));
ALTER TABLE "ProgramAssessment" ADD CONSTRAINT "ProgramAssessment_kind_check" CHECK (char_length("kind") <= 40);
ALTER TABLE "ProgramAssessment" ADD CONSTRAINT "ProgramAssessment_max_check" CHECK ("maxScore" > 0 AND "maxScore" <= 1000);
ALTER TABLE "ProgramAssessment" ADD CONSTRAINT "ProgramAssessment_pass_check" CHECK ("passMark" IS NULL OR ("passMark" >= 0 AND "passMark" <= "maxScore"));
ALTER TABLE "ProgramAssessment" ADD CONSTRAINT "ProgramAssessment_weight_check" CHECK ("weight" > 0 AND "weight" <= 100);
ALTER TABLE "ProgramAssessment" ADD CONSTRAINT "ProgramAssessment_published_check" CHECK (("status" = 'PUBLISHED') = ("publishedAt" IS NOT NULL) OR "status" = 'ARCHIVED');
-- A score is a number or a code, never both and never neither.
ALTER TABLE "ProgramScore" ADD CONSTRAINT "ProgramScore_one_of_check" CHECK (("score" IS NOT NULL) <> ("code" IS NOT NULL));
ALTER TABLE "ProgramScore" ADD CONSTRAINT "ProgramScore_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 1000));
ALTER TABLE "ProgramScore" ADD CONSTRAINT "ProgramScore_comment_check" CHECK (coalesce(char_length("comment"), 0) <= 500);
ALTER TABLE "ProgramScore" ADD CONSTRAINT "ProgramScore_version_check" CHECK ("version" >= 1);
ALTER TABLE "ProgramScoreChange" ADD CONSTRAINT "ProgramScoreChange_reason_check" CHECK (coalesce(char_length("reason"), 0) <= 500);
ALTER TABLE "Program" ADD CONSTRAINT "Program_gradeBands_check" CHECK ("gradeBands" IS NULL OR jsonb_typeof("gradeBands") = 'array');

-- Row-level security on every new table, in the same shape as the other program tables.
ALTER TABLE "ProgramAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramAssessment" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_assessment_read ON "ProgramAssessment" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_assessment_insert ON "ProgramAssessment" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_assessment_update ON "ProgramAssessment" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_assessment_delete ON "ProgramAssessment" FOR DELETE USING ("tenantId" = app_tenant_id());
ALTER TABLE "ProgramAssessmentGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramAssessmentGroup" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_assessment_group_read ON "ProgramAssessmentGroup" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_assessment_group_insert ON "ProgramAssessmentGroup" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_assessment_group_update ON "ProgramAssessmentGroup" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_assessment_group_delete ON "ProgramAssessmentGroup" FOR DELETE USING ("tenantId" = app_tenant_id());
ALTER TABLE "ProgramScore" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramScore" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_score_read ON "ProgramScore" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_score_insert ON "ProgramScore" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_score_update ON "ProgramScore" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY program_score_delete ON "ProgramScore" FOR DELETE USING ("tenantId" = app_tenant_id());
ALTER TABLE "ProgramScoreChange" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgramScoreChange" FORCE ROW LEVEL SECURITY;
CREATE POLICY program_score_change_read ON "ProgramScoreChange" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY program_score_change_insert ON "ProgramScoreChange" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());

-- Append-only for the role the application runs as: no row of these histories is ever changed or removed.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public."ProgramScoreChange" FROM app_user;
