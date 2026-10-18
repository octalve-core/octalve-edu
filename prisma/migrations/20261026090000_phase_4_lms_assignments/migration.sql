-- Phase 4 — Learning Management System (LMS), Assignments & Quizzes
-- ADDITIVE ONLY. Multi-tenant RLS policies and runtime locks included.

-- CreateEnums
CREATE TYPE "AssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'LATE', 'GRADED', 'RESUBMIT_REQUESTED');
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER');
CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable: Assignment
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "subjectId" TEXT NOT NULL,
    "classGroupId" TEXT,
    "classArmId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "dueDate" TIMESTAMP(3),
    "totalPoints" INTEGER NOT NULL DEFAULT 100,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "allowLate" BOOLEAN NOT NULL DEFAULT true,
    "attachments" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AssignmentSubmission
CREATE TABLE "AssignmentSubmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "content" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "score" DOUBLE PRECISION,
    "feedback" TEXT,
    "gradedById" TEXT,
    "gradedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable: LearningMaterial
CREATE TABLE "LearningMaterial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "subjectId" TEXT NOT NULL,
    "classGroupId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Quiz
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "subjectId" TEXT NOT NULL,
    "classGroupId" TEXT,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "timeLimitMinutes" INTEGER,
    "passingScore" DOUBLE PRECISION,
    "status" "QuizStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable: QuizQuestion
CREATE TABLE "QuizQuestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "questionType" "QuestionType" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
    "options" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "correctAnswer" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable: QuizAttempt
CREATE TABLE "QuizAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPassed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- Unique Indexes
CREATE UNIQUE INDEX "Assignment_tenantId_id_key" ON "Assignment"("tenantId", "id");
CREATE UNIQUE INDEX "AssignmentSubmission_tenantId_id_key" ON "AssignmentSubmission"("tenantId", "id");
CREATE UNIQUE INDEX "AssignmentSubmission_tenantId_assignmentId_studentId_key" ON "AssignmentSubmission"("tenantId", "assignmentId", "studentId");
CREATE UNIQUE INDEX "LearningMaterial_tenantId_id_key" ON "LearningMaterial"("tenantId", "id");
CREATE UNIQUE INDEX "Quiz_tenantId_id_key" ON "Quiz"("tenantId", "id");
CREATE UNIQUE INDEX "QuizQuestion_tenantId_id_key" ON "QuizQuestion"("tenantId", "id");
CREATE UNIQUE INDEX "QuizAttempt_tenantId_id_key" ON "QuizAttempt"("tenantId", "id");

-- Performance Indexes
CREATE INDEX "Assignment_tenantId_subjectId_idx" ON "Assignment"("tenantId", "subjectId");
CREATE INDEX "Assignment_tenantId_classGroupId_idx" ON "Assignment"("tenantId", "classGroupId");
CREATE INDEX "Assignment_tenantId_classArmId_idx" ON "Assignment"("tenantId", "classArmId");
CREATE INDEX "Assignment_tenantId_status_idx" ON "Assignment"("tenantId", "status");

CREATE INDEX "AssignmentSubmission_tenantId_assignmentId_idx" ON "AssignmentSubmission"("tenantId", "assignmentId");
CREATE INDEX "AssignmentSubmission_tenantId_studentId_idx" ON "AssignmentSubmission"("tenantId", "studentId");
CREATE INDEX "AssignmentSubmission_tenantId_status_idx" ON "AssignmentSubmission"("tenantId", "status");

CREATE INDEX "LearningMaterial_tenantId_subjectId_idx" ON "LearningMaterial"("tenantId", "subjectId");
CREATE INDEX "LearningMaterial_tenantId_classGroupId_idx" ON "LearningMaterial"("tenantId", "classGroupId");

CREATE INDEX "Quiz_tenantId_subjectId_idx" ON "Quiz"("tenantId", "subjectId");
CREATE INDEX "Quiz_tenantId_status_idx" ON "Quiz"("tenantId", "status");

CREATE INDEX "QuizQuestion_tenantId_quizId_idx" ON "QuizQuestion"("tenantId", "quizId");

CREATE INDEX "QuizAttempt_tenantId_quizId_idx" ON "QuizAttempt"("tenantId", "quizId");
CREATE INDEX "QuizAttempt_tenantId_studentId_idx" ON "QuizAttempt"("tenantId", "studentId");

-- Foreign Keys: Assignment
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES "Campus"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tenantId_subjectId_fkey" FOREIGN KEY ("tenantId", "subjectId") REFERENCES "Subject"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tenantId_classGroupId_fkey" FOREIGN KEY ("tenantId", "classGroupId") REFERENCES "ClassGroup"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tenantId_classArmId_fkey" FOREIGN KEY ("tenantId", "classArmId") REFERENCES "ClassArm"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tenantId_createdById_fkey" FOREIGN KEY ("tenantId", "createdById") REFERENCES "StaffRecord"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Foreign Keys: AssignmentSubmission
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_tenantId_assignmentId_fkey" FOREIGN KEY ("tenantId", "assignmentId") REFERENCES "Assignment"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "StudentRecord"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_tenantId_gradedById_fkey" FOREIGN KEY ("tenantId", "gradedById") REFERENCES "StaffRecord"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Foreign Keys: LearningMaterial
ALTER TABLE "LearningMaterial" ADD CONSTRAINT "LearningMaterial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningMaterial" ADD CONSTRAINT "LearningMaterial_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES "Campus"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "LearningMaterial" ADD CONSTRAINT "LearningMaterial_tenantId_subjectId_fkey" FOREIGN KEY ("tenantId", "subjectId") REFERENCES "Subject"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "LearningMaterial" ADD CONSTRAINT "LearningMaterial_tenantId_classGroupId_fkey" FOREIGN KEY ("tenantId", "classGroupId") REFERENCES "ClassGroup"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "LearningMaterial" ADD CONSTRAINT "LearningMaterial_tenantId_createdById_fkey" FOREIGN KEY ("tenantId", "createdById") REFERENCES "StaffRecord"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Foreign Keys: Quiz
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES "Campus"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_tenantId_subjectId_fkey" FOREIGN KEY ("tenantId", "subjectId") REFERENCES "Subject"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_tenantId_classGroupId_fkey" FOREIGN KEY ("tenantId", "classGroupId") REFERENCES "ClassGroup"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_tenantId_createdById_fkey" FOREIGN KEY ("tenantId", "createdById") REFERENCES "StaffRecord"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Foreign Keys: QuizQuestion
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_tenantId_quizId_fkey" FOREIGN KEY ("tenantId", "quizId") REFERENCES "Quiz"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign Keys: QuizAttempt
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_tenantId_quizId_fkey" FOREIGN KEY ("tenantId", "quizId") REFERENCES "Quiz"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "StudentRecord"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Row-Level Security: Assignment
ALTER TABLE "Assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Assignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY assignment_tenant_isolation ON "Assignment" FOR ALL TO app_user
    USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

-- Row-Level Security: AssignmentSubmission
ALTER TABLE "AssignmentSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssignmentSubmission" FORCE ROW LEVEL SECURITY;
CREATE POLICY assignment_submission_tenant_isolation ON "AssignmentSubmission" FOR ALL TO app_user
    USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

-- Row-Level Security: LearningMaterial
ALTER TABLE "LearningMaterial" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LearningMaterial" FORCE ROW LEVEL SECURITY;
CREATE POLICY learning_material_tenant_isolation ON "LearningMaterial" FOR ALL TO app_user
    USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

-- Row-Level Security: Quiz
ALTER TABLE "Quiz" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Quiz" FORCE ROW LEVEL SECURITY;
CREATE POLICY quiz_tenant_isolation ON "Quiz" FOR ALL TO app_user
    USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

-- Row-Level Security: QuizQuestion
ALTER TABLE "QuizQuestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuizQuestion" FORCE ROW LEVEL SECURITY;
CREATE POLICY quiz_question_tenant_isolation ON "QuizQuestion" FOR ALL TO app_user
    USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

-- Row-Level Security: QuizAttempt
ALTER TABLE "QuizAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuizAttempt" FORCE ROW LEVEL SECURITY;
CREATE POLICY quiz_attempt_tenant_isolation ON "QuizAttempt" FOR ALL TO app_user
    USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

-- Owner policies for migrator / system superuser
DO $$
BEGIN
  EXECUTE format('CREATE POLICY assignment_owner ON "Assignment" FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
  EXECUTE format('CREATE POLICY assignment_submission_owner ON "AssignmentSubmission" FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
  EXECUTE format('CREATE POLICY learning_material_owner ON "LearningMaterial" FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
  EXECUTE format('CREATE POLICY quiz_owner ON "Quiz" FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
  EXECUTE format('CREATE POLICY quiz_question_owner ON "QuizQuestion" FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
  EXECUTE format('CREATE POLICY quiz_attempt_owner ON "QuizAttempt" FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
END
$$;

-- Grant runtime role app_user permissions on the new LMS tables
SELECT app_grant_runtime_privileges();

