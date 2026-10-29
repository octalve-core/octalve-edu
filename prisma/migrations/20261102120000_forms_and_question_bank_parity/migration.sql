-- CreateEnum
CREATE TYPE "FormKind" AS ENUM ('PRACTICE_SET', 'QUESTIONNAIRE', 'PAPER_WORK');

-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FormAudienceKind" AS ENUM ('MEMBERS', 'PUBLIC');

-- CreateEnum
CREATE TYPE "FormResponseStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "FormMarkingMethod" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "FormMarkingStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PARTIALLY_MARKED', 'MARKED');

-- CreateEnum
CREATE TYPE "TurnInStatus" AS ENUM ('PENDING', 'HANDED_IN', 'LATE');

-- CreateEnum
CREATE TYPE "PracticeFeedbackMode" AS ENUM ('EACH', 'END');

-- CreateEnum
CREATE TYPE "QuestionReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "QuestionReportOutcome" AS ENUM ('FIXED', 'NOT_AN_ERROR', 'NEEDS_DISCUSSION');

-- CreateEnum
CREATE TYPE "PrintTargetKind" AS ENUM ('QUESTION_BANK_ITEM', 'FORM', 'QUIZ', 'PRACTICE_SESSION', 'FORM_RESPONSE');

-- CreateTable
CREATE TABLE "Form" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "kind" "FormKind" NOT NULL DEFAULT 'PRACTICE_SET',
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "shareToken" TEXT,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "maxDurationMinutes" INTEGER,
    "createdById" TEXT NOT NULL,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormParticipation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "respondentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormParticipation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormAudience" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "kind" "FormAudienceKind" NOT NULL DEFAULT 'MEMBERS',
    "roles" JSONB NOT NULL DEFAULT '[]',
    "classGroupId" TEXT,
    "classGroupIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormQuestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "sourceItemId" TEXT,
    "sourceVersion" INTEGER,
    "prompt" TEXT NOT NULL,
    "questionType" "BankQuestionType" NOT NULL DEFAULT 'SINGLE',
    "options" JSONB NOT NULL DEFAULT '[]',
    "correctAnswer" TEXT,
    "explanation" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "markingMethod" "FormMarkingMethod" NOT NULL DEFAULT 'AUTO',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormResponse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "formId" TEXT NOT NULL,
    "respondentId" TEXT,
    "studentId" TEXT,
    "status" "FormResponseStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "score" DOUBLE PRECISION DEFAULT 0,
    "maxScore" DOUBLE PRECISION DEFAULT 0,
    "markingStatus" "FormMarkingStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "markedById" TEXT,
    "markedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormAnswer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "formQuestionId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "isCorrect" BOOLEAN,
    "score" DOUBLE PRECISION DEFAULT 0,
    "markingStatus" "FormMarkingStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "markedById" TEXT,
    "markedAt" TIMESTAMP(3),
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormMarkingAudit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "answerId" TEXT,
    "formId" TEXT NOT NULL,
    "studentId" TEXT,
    "scoreAwarded" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "feedback" TEXT,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormMarkingAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormTurnIn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "formId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "TurnInStatus" NOT NULL DEFAULT 'PENDING',
    "markedById" TEXT,
    "markedAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormTurnIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormTurnInAudit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "turnInId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "TurnInStatus" NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormTurnInAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "studentId" TEXT NOT NULL,
    "classGroupId" TEXT,
    "subjectLabel" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "topic" TEXT,
    "size" INTEGER NOT NULL,
    "feedbackMode" "PracticeFeedbackMode" NOT NULL DEFAULT 'EACH',
    "itemIds" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "bankItemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "answer" JSONB NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "PracticeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "bankItemId" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "reporterRole" TEXT NOT NULL,
    "reporterStudentId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "QuestionReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "outcome" "QuestionReportOutcome",
    "explanation" TEXT,
    "regradeImpact" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBankPrintLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "targetKind" "PrintTargetKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "watermark" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT,
    "recipientStudentId" TEXT,
    "printedById" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "printedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionBankPrintLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Form_shareToken_key" ON "Form"("shareToken");

-- CreateIndex
CREATE INDEX "Form_tenantId_kind_status_idx" ON "Form"("tenantId", "kind", "status");

-- CreateIndex
CREATE INDEX "Form_tenantId_createdAt_idx" ON "Form"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Form_tenantId_id_key" ON "Form"("tenantId", "id");

-- CreateIndex
CREATE INDEX "FormParticipation_tenantId_formId_idx" ON "FormParticipation"("tenantId", "formId");

-- CreateIndex
CREATE INDEX "FormParticipation_tenantId_respondentId_idx" ON "FormParticipation"("tenantId", "respondentId");

-- CreateIndex
CREATE UNIQUE INDEX "FormParticipation_tenantId_id_key" ON "FormParticipation"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FormParticipation_tenantId_formId_respondentId_key" ON "FormParticipation"("tenantId", "formId", "respondentId");

-- CreateIndex
CREATE INDEX "FormAudience_tenantId_formId_idx" ON "FormAudience"("tenantId", "formId");

-- CreateIndex
CREATE UNIQUE INDEX "FormAudience_tenantId_id_key" ON "FormAudience"("tenantId", "id");

-- CreateIndex
CREATE INDEX "FormQuestion_tenantId_formId_idx" ON "FormQuestion"("tenantId", "formId");

-- CreateIndex
CREATE INDEX "FormQuestion_tenantId_sourceItemId_idx" ON "FormQuestion"("tenantId", "sourceItemId");

-- CreateIndex
CREATE UNIQUE INDEX "FormQuestion_tenantId_id_key" ON "FormQuestion"("tenantId", "id");

-- CreateIndex
CREATE INDEX "FormResponse_tenantId_formId_status_idx" ON "FormResponse"("tenantId", "formId", "status");

-- CreateIndex
CREATE INDEX "FormResponse_tenantId_formId_markingStatus_idx" ON "FormResponse"("tenantId", "formId", "markingStatus");

-- CreateIndex
CREATE INDEX "FormResponse_tenantId_studentId_idx" ON "FormResponse"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "FormResponse_tenantId_id_key" ON "FormResponse"("tenantId", "id");

-- CreateIndex
CREATE INDEX "FormAnswer_tenantId_responseId_idx" ON "FormAnswer"("tenantId", "responseId");

-- CreateIndex
CREATE INDEX "FormAnswer_tenantId_formQuestionId_idx" ON "FormAnswer"("tenantId", "formQuestionId");

-- CreateIndex
CREATE INDEX "FormAnswer_tenantId_markingStatus_idx" ON "FormAnswer"("tenantId", "markingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "FormAnswer_tenantId_id_key" ON "FormAnswer"("tenantId", "id");

-- CreateIndex
CREATE INDEX "FormMarkingAudit_tenantId_responseId_idx" ON "FormMarkingAudit"("tenantId", "responseId");

-- CreateIndex
CREATE INDEX "FormMarkingAudit_tenantId_answerId_idx" ON "FormMarkingAudit"("tenantId", "answerId");

-- CreateIndex
CREATE INDEX "FormMarkingAudit_tenantId_formId_idx" ON "FormMarkingAudit"("tenantId", "formId");

-- CreateIndex
CREATE INDEX "FormMarkingAudit_tenantId_createdAt_idx" ON "FormMarkingAudit"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FormMarkingAudit_tenantId_id_key" ON "FormMarkingAudit"("tenantId", "id");

-- CreateIndex
CREATE INDEX "FormTurnIn_tenantId_formId_status_idx" ON "FormTurnIn"("tenantId", "formId", "status");

-- CreateIndex
CREATE INDEX "FormTurnIn_tenantId_studentId_idx" ON "FormTurnIn"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "FormTurnIn_tenantId_id_key" ON "FormTurnIn"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FormTurnIn_tenantId_formId_studentId_key" ON "FormTurnIn"("tenantId", "formId", "studentId");

-- CreateIndex
CREATE INDEX "FormTurnInAudit_tenantId_formId_idx" ON "FormTurnInAudit"("tenantId", "formId");

-- CreateIndex
CREATE INDEX "FormTurnInAudit_tenantId_turnInId_idx" ON "FormTurnInAudit"("tenantId", "turnInId");

-- CreateIndex
CREATE INDEX "FormTurnInAudit_tenantId_createdAt_idx" ON "FormTurnInAudit"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FormTurnInAudit_tenantId_id_key" ON "FormTurnInAudit"("tenantId", "id");

-- CreateIndex
CREATE INDEX "PracticeSession_tenantId_studentId_startedAt_idx" ON "PracticeSession"("tenantId", "studentId", "startedAt");

-- CreateIndex
CREATE INDEX "PracticeSession_tenantId_subjectKey_idx" ON "PracticeSession"("tenantId", "subjectKey");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeSession_tenantId_id_key" ON "PracticeSession"("tenantId", "id");

-- CreateIndex
CREATE INDEX "PracticeAttempt_tenantId_studentId_answeredAt_idx" ON "PracticeAttempt"("tenantId", "studentId", "answeredAt");

-- CreateIndex
CREATE INDEX "PracticeAttempt_tenantId_sessionId_idx" ON "PracticeAttempt"("tenantId", "sessionId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_tenantId_bankItemId_idx" ON "PracticeAttempt"("tenantId", "bankItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeAttempt_tenantId_id_key" ON "PracticeAttempt"("tenantId", "id");

-- CreateIndex
CREATE INDEX "QuestionReport_tenantId_bankItemId_status_idx" ON "QuestionReport"("tenantId", "bankItemId", "status");

-- CreateIndex
CREATE INDEX "QuestionReport_tenantId_reporterUserId_idx" ON "QuestionReport"("tenantId", "reporterUserId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionReport_tenantId_id_key" ON "QuestionReport"("tenantId", "id");

-- CreateIndex
CREATE INDEX "QuestionBankPrintLog_tenantId_targetKind_targetId_idx" ON "QuestionBankPrintLog"("tenantId", "targetKind", "targetId");

-- CreateIndex
CREATE INDEX "QuestionBankPrintLog_tenantId_printedById_idx" ON "QuestionBankPrintLog"("tenantId", "printedById");

-- CreateIndex
CREATE INDEX "QuestionBankPrintLog_tenantId_printedAt_idx" ON "QuestionBankPrintLog"("tenantId", "printedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionBankPrintLog_tenantId_id_key" ON "QuestionBankPrintLog"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES "Campus"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormParticipation" ADD CONSTRAINT "FormParticipation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormParticipation" ADD CONSTRAINT "FormParticipation_tenantId_formId_fkey" FOREIGN KEY ("tenantId", "formId") REFERENCES "Form"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAudience" ADD CONSTRAINT "FormAudience_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAudience" ADD CONSTRAINT "FormAudience_tenantId_formId_fkey" FOREIGN KEY ("tenantId", "formId") REFERENCES "Form"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAudience" ADD CONSTRAINT "FormAudience_tenantId_classGroupId_fkey" FOREIGN KEY ("tenantId", "classGroupId") REFERENCES "ClassGroup"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormQuestion" ADD CONSTRAINT "FormQuestion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormQuestion" ADD CONSTRAINT "FormQuestion_tenantId_formId_fkey" FOREIGN KEY ("tenantId", "formId") REFERENCES "Form"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormQuestion" ADD CONSTRAINT "FormQuestion_tenantId_sourceItemId_fkey" FOREIGN KEY ("tenantId", "sourceItemId") REFERENCES "QuestionBankItem"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES "Campus"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_tenantId_formId_fkey" FOREIGN KEY ("tenantId", "formId") REFERENCES "Form"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "StudentRecord"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAnswer" ADD CONSTRAINT "FormAnswer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAnswer" ADD CONSTRAINT "FormAnswer_tenantId_responseId_fkey" FOREIGN KEY ("tenantId", "responseId") REFERENCES "FormResponse"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAnswer" ADD CONSTRAINT "FormAnswer_tenantId_formQuestionId_fkey" FOREIGN KEY ("tenantId", "formQuestionId") REFERENCES "FormQuestion"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAnswer" ADD CONSTRAINT "FormAnswer_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormMarkingAudit" ADD CONSTRAINT "FormMarkingAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormMarkingAudit" ADD CONSTRAINT "FormMarkingAudit_tenantId_responseId_fkey" FOREIGN KEY ("tenantId", "responseId") REFERENCES "FormResponse"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormMarkingAudit" ADD CONSTRAINT "FormMarkingAudit_tenantId_answerId_fkey" FOREIGN KEY ("tenantId", "answerId") REFERENCES "FormAnswer"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormMarkingAudit" ADD CONSTRAINT "FormMarkingAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTurnIn" ADD CONSTRAINT "FormTurnIn_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTurnIn" ADD CONSTRAINT "FormTurnIn_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES "Campus"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTurnIn" ADD CONSTRAINT "FormTurnIn_tenantId_formId_fkey" FOREIGN KEY ("tenantId", "formId") REFERENCES "Form"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTurnIn" ADD CONSTRAINT "FormTurnIn_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "StudentRecord"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTurnIn" ADD CONSTRAINT "FormTurnIn_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTurnInAudit" ADD CONSTRAINT "FormTurnInAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTurnInAudit" ADD CONSTRAINT "FormTurnInAudit_tenantId_turnInId_fkey" FOREIGN KEY ("tenantId", "turnInId") REFERENCES "FormTurnIn"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTurnInAudit" ADD CONSTRAINT "FormTurnInAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES "Campus"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "StudentRecord"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_tenantId_classGroupId_fkey" FOREIGN KEY ("tenantId", "classGroupId") REFERENCES "ClassGroup"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_tenantId_sessionId_fkey" FOREIGN KEY ("tenantId", "sessionId") REFERENCES "PracticeSession"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "StudentRecord"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_tenantId_bankItemId_fkey" FOREIGN KEY ("tenantId", "bankItemId") REFERENCES "QuestionBankItem"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES "Campus"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_tenantId_bankItemId_fkey" FOREIGN KEY ("tenantId", "bankItemId") REFERENCES "QuestionBankItem"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_tenantId_reporterStudentId_fkey" FOREIGN KEY ("tenantId", "reporterStudentId") REFERENCES "StudentRecord"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankPrintLog" ADD CONSTRAINT "QuestionBankPrintLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankPrintLog" ADD CONSTRAINT "QuestionBankPrintLog_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES "Campus"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankPrintLog" ADD CONSTRAINT "QuestionBankPrintLog_printedById_fkey" FOREIGN KEY ("printedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankPrintLog" ADD CONSTRAINT "QuestionBankPrintLog_tenantId_recipientStudentId_fkey" FOREIGN KEY ("tenantId", "recipientStudentId") REFERENCES "StudentRecord"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Append-only triggers for audit logs and print logs (UPDATE and DELETE refused)
-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------

CREATE TRIGGER "FormMarkingAudit_append_only" BEFORE UPDATE OR DELETE ON "FormMarkingAudit" FOR EACH ROW EXECUTE FUNCTION "question_bank_append_only"();
CREATE TRIGGER "FormTurnInAudit_append_only" BEFORE UPDATE OR DELETE ON "FormTurnInAudit" FOR EACH ROW EXECUTE FUNCTION "question_bank_append_only"();
CREATE TRIGGER "QuestionBankPrintLog_append_only" BEFORE UPDATE OR DELETE ON "QuestionBankPrintLog" FOR EACH ROW EXECUTE FUNCTION "question_bank_append_only"();

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Row-level security on all 13 tables (ADR 0001: enabled, forced, tenant-isolated)
-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------

ALTER TABLE "Form" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Form" FORCE ROW LEVEL SECURITY;
CREATE POLICY form_tenant_isolation ON "Form" FOR ALL TO app_user USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "FormParticipation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FormParticipation" FORCE ROW LEVEL SECURITY;
CREATE POLICY form_participation_tenant_isolation ON "FormParticipation" FOR ALL TO app_user USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "FormAudience" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FormAudience" FORCE ROW LEVEL SECURITY;
CREATE POLICY form_audience_tenant_isolation ON "FormAudience" FOR ALL TO app_user USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "FormQuestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FormQuestion" FORCE ROW LEVEL SECURITY;
CREATE POLICY form_question_tenant_isolation ON "FormQuestion" FOR ALL TO app_user USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "FormResponse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FormResponse" FORCE ROW LEVEL SECURITY;
CREATE POLICY form_response_tenant_isolation ON "FormResponse" FOR ALL TO app_user USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "FormAnswer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FormAnswer" FORCE ROW LEVEL SECURITY;
CREATE POLICY form_answer_tenant_isolation ON "FormAnswer" FOR ALL TO app_user USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "FormMarkingAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FormMarkingAudit" FORCE ROW LEVEL SECURITY;
CREATE POLICY form_marking_audit_tenant_isolation ON "FormMarkingAudit" FOR ALL TO app_user USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "FormTurnIn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FormTurnIn" FORCE ROW LEVEL SECURITY;
CREATE POLICY form_turn_in_tenant_isolation ON "FormTurnIn" FOR ALL TO app_user USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "FormTurnInAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FormTurnInAudit" FORCE ROW LEVEL SECURITY;
CREATE POLICY form_turn_in_audit_tenant_isolation ON "FormTurnInAudit" FOR ALL TO app_user USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "PracticeSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PracticeSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY practice_session_tenant_isolation ON "PracticeSession" FOR ALL TO app_user USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "PracticeAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PracticeAttempt" FORCE ROW LEVEL SECURITY;
CREATE POLICY practice_attempt_tenant_isolation ON "PracticeAttempt" FOR ALL TO app_user USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "QuestionReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuestionReport" FORCE ROW LEVEL SECURITY;
CREATE POLICY question_report_tenant_isolation ON "QuestionReport" FOR ALL TO app_user USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "QuestionBankPrintLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuestionBankPrintLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY question_bank_print_log_tenant_isolation ON "QuestionBankPrintLog" FOR ALL TO app_user USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."Form" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."FormParticipation" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."FormAudience" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."FormQuestion" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."FormResponse" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."FormAnswer" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."FormMarkingAudit" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."FormTurnIn" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."FormTurnInAudit" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."PracticeSession" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."PracticeAttempt" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."QuestionReport" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."QuestionBankPrintLog" TO app_user;

REVOKE ALL ON TABLE public."_prisma_migrations" FROM app_user;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public."AuditLog" FROM app_user;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public."ResultAudit" FROM app_user;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public."SettingsChangeAudit" FROM app_user;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public."NotificationAuditLog" FROM app_user;


