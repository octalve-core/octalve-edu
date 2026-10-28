-- AlterTable Quiz
ALTER TABLE "Quiz" ADD COLUMN "isExamTemplate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Quiz" ADD COLUMN "examWindowStart" TIMESTAMP(3);
ALTER TABLE "Quiz" ADD COLUMN "examWindowEnd" TIMESTAMP(3);

-- AlterTable QuizQuestion
ALTER TABLE "QuizQuestion" ADD COLUMN "sourceItemId" TEXT;
ALTER TABLE "QuizQuestion" ADD COLUMN "sourceVersion" INTEGER;
ALTER TABLE "QuizQuestion" ADD COLUMN "exposedToPractice" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "QuizQuestion_tenantId_sourceItemId_idx" ON "QuizQuestion"("tenantId", "sourceItemId");

-- AlterTable QuestionBankItem
ALTER TABLE "QuestionBankItem" ADD COLUMN "visibleAfterQuizId" TEXT;

-- CreateIndex
CREATE INDEX "QuestionBankItem_tenantId_visibleAfterQuizId_idx" ON "QuestionBankItem"("tenantId", "visibleAfterQuizId");

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_tenantId_sourceItemId_fkey" FOREIGN KEY ("tenantId", "sourceItemId") REFERENCES "QuestionBankItem"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_tenantId_visibleAfterQuizId_fkey" FOREIGN KEY ("tenantId", "visibleAfterQuizId") REFERENCES "Quiz"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
