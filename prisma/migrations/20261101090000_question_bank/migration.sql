-- Question bank (task 0024, slices A to E; design note docs/development-history/forms-and-question-bank-parity.md). ADDITIVE: six enums and nine new tables; NO existing table is
-- changed (the relation fields added to Tenant, Campus, TenantMembership and User in the Prisma schema produce no SQL). The maintainer runs it on the hosted database BEFORE the
-- code that reads it is deployed there (ADR 0003). The tables and keys were generated with `prisma migrate diff` from dev's schema; the checks, the unique indexes, the triggers
-- and the row-level security below were added by hand, in this file, so there is no moment when a table exists without its policy (ADR 0001).
--
-- What the database refuses, whichever code writes: a fifth image on an item (the school's limit of 3 or 4 is a service rule; 4 is the hard stop); an image with no alt text that
-- is not marked decorative; a rating or free-text question in the assessment bank, or a correct answer on a questionnaire item; a subject reviewer without a subject (or a general
-- one with one); a duplicate reviewer row or setting row; a settings change that was not preceded by a fresh re-authentication; any change to or removal of a review, a version
-- or an audit row (TRUNCATE is deliberately NOT guarded, so test resets work, the same limit as ResultAudit); a visibility that moves backwards or a date in the past; an
-- approved or retired item that does not say who approved it, when, and (retired) why.
-- Items are archived (RETIRED), never deleted, so no policy lets the application delete one (ADR 0004).

-- CreateEnum
CREATE TYPE "BankKind" AS ENUM ('ASSESSMENT', 'QUESTIONNAIRE');

-- CreateEnum
CREATE TYPE "BankQuestionType" AS ENUM ('SINGLE', 'MULTI', 'TRUE_FALSE', 'SHORT', 'RATING', 'TEXT');

-- CreateEnum
CREATE TYPE "BankVisibility" AS ENUM ('PRACTICE', 'TEACHERS_ONLY', 'TEACHERS_ONLY_UNTIL');

-- CreateEnum
CREATE TYPE "BankItemStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'RETIRED');

-- CreateEnum
CREATE TYPE "BankReviewOutcome" AS ENUM ('APPROVED', 'EDITED', 'REJECTED', 'RETIRED');

-- CreateEnum
CREATE TYPE "BankReviewerScope" AS ENUM ('GENERAL', 'SUBJECT');

-- CreateTable
CREATE TABLE "QuestionBankItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "bank" "BankKind" NOT NULL DEFAULT 'ASSESSMENT',
    "type" "BankQuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "explanation" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "difficulty" INTEGER,
    "topic" TEXT,
    "options" JSONB NOT NULL DEFAULT '[]',
    "correctAnswer" JSONB,
    "subjectLabel" TEXT,
    "subjectKey" TEXT,
    "visibility" "BankVisibility" NOT NULL DEFAULT 'TEACHERS_ONLY',
    "visibleFrom" TIMESTAMP(3),
    "status" "BankItemStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "retiredReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionBankItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBankImage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "decorative" BOOLEAN NOT NULL DEFAULT false,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionBankImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBankItemVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionBankItemVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBankClassTag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelKey" TEXT NOT NULL,

    CONSTRAINT "QuestionBankClassTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBankReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "outcome" "BankReviewOutcome" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionBankReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBankReviewer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campusId" TEXT,
    "scope" "BankReviewerScope" NOT NULL,
    "subjectLabel" TEXT,
    "subjectKey" TEXT,
    "isExamApprover" BOOLEAN NOT NULL DEFAULT false,
    "assignedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionBankReviewer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOverlapFlag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "similarToItemId" TEXT,
    "similarToAssessmentQuestionId" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionOverlapFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBankAudit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "itemId" TEXT,
    "actorUserId" TEXT,
    "entity" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ref" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "stepUpVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionBankAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBankSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionBankSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionBankItem_tenantId_campusId_status_idx" ON "QuestionBankItem"("tenantId", "campusId", "status");

-- CreateIndex
CREATE INDEX "QuestionBankItem_tenantId_status_visibility_idx" ON "QuestionBankItem"("tenantId", "status", "visibility");

-- CreateIndex
CREATE INDEX "QuestionBankItem_tenantId_bank_subjectKey_idx" ON "QuestionBankItem"("tenantId", "bank", "subjectKey");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionBankItem_tenantId_id_key" ON "QuestionBankItem"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionBankImage_storageKey_key" ON "QuestionBankImage"("storageKey");

-- CreateIndex
CREATE INDEX "QuestionBankImage_tenantId_itemId_idx" ON "QuestionBankImage"("tenantId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionBankImage_itemId_sortOrder_key" ON "QuestionBankImage"("itemId", "sortOrder");

-- CreateIndex
CREATE INDEX "QuestionBankItemVersion_tenantId_itemId_idx" ON "QuestionBankItemVersion"("tenantId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionBankItemVersion_itemId_version_key" ON "QuestionBankItemVersion"("itemId", "version");

-- CreateIndex
CREATE INDEX "QuestionBankClassTag_tenantId_labelKey_idx" ON "QuestionBankClassTag"("tenantId", "labelKey");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionBankClassTag_itemId_labelKey_key" ON "QuestionBankClassTag"("itemId", "labelKey");

-- CreateIndex
CREATE INDEX "QuestionBankReview_tenantId_itemId_createdAt_idx" ON "QuestionBankReview"("tenantId", "itemId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionBankReviewer_tenantId_userId_idx" ON "QuestionBankReviewer"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "QuestionBankReviewer_tenantId_campusId_scope_idx" ON "QuestionBankReviewer"("tenantId", "campusId", "scope");

-- CreateIndex
CREATE INDEX "QuestionOverlapFlag_tenantId_itemId_idx" ON "QuestionOverlapFlag"("tenantId", "itemId");

-- CreateIndex
CREATE INDEX "QuestionBankAudit_tenantId_campusId_createdAt_idx" ON "QuestionBankAudit"("tenantId", "campusId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionBankAudit_tenantId_itemId_idx" ON "QuestionBankAudit"("tenantId", "itemId");

-- CreateIndex
CREATE INDEX "QuestionBankAudit_tenantId_createdAt_idx" ON "QuestionBankAudit"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionBankSetting_tenantId_campusId_idx" ON "QuestionBankSetting"("tenantId", "campusId");

-- AddForeignKey
ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES "Campus"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_submittedById_tenantId_fkey" FOREIGN KEY ("submittedById", "tenantId") REFERENCES "TenantMembership"("userId", "tenantId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_approvedById_tenantId_fkey" FOREIGN KEY ("approvedById", "tenantId") REFERENCES "TenantMembership"("userId", "tenantId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankImage" ADD CONSTRAINT "QuestionBankImage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankImage" ADD CONSTRAINT "QuestionBankImage_tenantId_itemId_fkey" FOREIGN KEY ("tenantId", "itemId") REFERENCES "QuestionBankItem"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankItemVersion" ADD CONSTRAINT "QuestionBankItemVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankItemVersion" ADD CONSTRAINT "QuestionBankItemVersion_tenantId_itemId_fkey" FOREIGN KEY ("tenantId", "itemId") REFERENCES "QuestionBankItem"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankItemVersion" ADD CONSTRAINT "QuestionBankItemVersion_actorUserId_tenantId_fkey" FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "TenantMembership"("userId", "tenantId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankClassTag" ADD CONSTRAINT "QuestionBankClassTag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankClassTag" ADD CONSTRAINT "QuestionBankClassTag_tenantId_itemId_fkey" FOREIGN KEY ("tenantId", "itemId") REFERENCES "QuestionBankItem"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankReview" ADD CONSTRAINT "QuestionBankReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankReview" ADD CONSTRAINT "QuestionBankReview_tenantId_itemId_fkey" FOREIGN KEY ("tenantId", "itemId") REFERENCES "QuestionBankItem"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankReview" ADD CONSTRAINT "QuestionBankReview_reviewerId_tenantId_fkey" FOREIGN KEY ("reviewerId", "tenantId") REFERENCES "TenantMembership"("userId", "tenantId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankReviewer" ADD CONSTRAINT "QuestionBankReviewer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankReviewer" ADD CONSTRAINT "QuestionBankReviewer_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES "Campus"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankReviewer" ADD CONSTRAINT "QuestionBankReviewer_userId_tenantId_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES "TenantMembership"("userId", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankReviewer" ADD CONSTRAINT "QuestionBankReviewer_assignedById_tenantId_fkey" FOREIGN KEY ("assignedById", "tenantId") REFERENCES "TenantMembership"("userId", "tenantId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOverlapFlag" ADD CONSTRAINT "QuestionOverlapFlag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOverlapFlag" ADD CONSTRAINT "QuestionOverlapFlag_tenantId_itemId_fkey" FOREIGN KEY ("tenantId", "itemId") REFERENCES "QuestionBankItem"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOverlapFlag" ADD CONSTRAINT "QuestionOverlapFlag_tenantId_similarToItemId_fkey" FOREIGN KEY ("tenantId", "similarToItemId") REFERENCES "QuestionBankItem"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankAudit" ADD CONSTRAINT "QuestionBankAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankAudit" ADD CONSTRAINT "QuestionBankAudit_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES "Campus"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankAudit" ADD CONSTRAINT "QuestionBankAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankSetting" ADD CONSTRAINT "QuestionBankSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankSetting" ADD CONSTRAINT "QuestionBankSetting_tenantId_campusId_fkey" FOREIGN KEY ("tenantId", "campusId") REFERENCES "Campus"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBankSetting" ADD CONSTRAINT "QuestionBankSetting_updatedById_tenantId_fkey" FOREIGN KEY ("updatedById", "tenantId") REFERENCES "TenantMembership"("userId", "tenantId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Row rules.
ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_sane" CHECK (
  "points" >= 0 AND "version" >= 1
  AND ("difficulty" IS NULL OR "difficulty" BETWEEN 1 AND 5)
  AND length(btrim("prompt", E' \t\r\n\f\v\u00a0')) > 0
  AND (("subjectLabel" IS NULL) = ("subjectKey" IS NULL))
  AND ("subjectKey" IS NULL OR length("subjectKey") > 0)
);
-- Rating and free text exist only in the questionnaire bank, and a questionnaire item has no correct answer.
ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_kind_types" CHECK (
  ("type" NOT IN ('RATING', 'TEXT') OR "bank" = 'QUESTIONNAIRE')
  AND ("bank" <> 'QUESTIONNAIRE' OR "correctAnswer" IS NULL)
);
ALTER TABLE "QuestionBankImage" ADD CONSTRAINT "QuestionBankImage_sane" CHECK (
  "bytes" > 0 AND "width" > 0 AND "height" > 0 AND "sortOrder" >= 0
  AND ("decorative" OR length(btrim("alt", E' \t\r\n\f\v\u00a0')) > 0)
);
-- What OUR record says a picture is, and which backend holds it (kept equal to the application's list of stores by a test). The storage key is unique (the generated index).
ALTER TABLE "QuestionBankImage" ADD CONSTRAINT "QuestionBankImage_store" CHECK ("store" IN ('s3', 'r2', 'cloudinary', 'memory'));
ALTER TABLE "QuestionBankImage" ADD CONSTRAINT "QuestionBankImage_contentType" CHECK ("contentType" IN ('image/jpeg', 'image/png', 'image/webp'));
ALTER TABLE "QuestionBankItemVersion" ADD CONSTRAINT "QuestionBankItemVersion_sane" CHECK ("version" >= 1 AND jsonb_typeof("snapshot") = 'object');
ALTER TABLE "QuestionBankClassTag" ADD CONSTRAINT "QuestionBankClassTag_sane" CHECK (length("labelKey") > 0 AND length(btrim("label", E' \t\r\n\f\v\u00a0')) > 0);
ALTER TABLE "QuestionBankReviewer" ADD CONSTRAINT "QuestionBankReviewer_scope" CHECK (
  ("scope" = 'SUBJECT' AND "subjectKey" IS NOT NULL AND length("subjectKey") > 0 AND "subjectLabel" IS NOT NULL)
  OR ("scope" = 'GENERAL' AND "subjectKey" IS NULL AND "subjectLabel" IS NULL)
);
ALTER TABLE "QuestionOverlapFlag" ADD CONSTRAINT "QuestionOverlapFlag_score" CHECK ("score" >= 0 AND "score" <= 1);
ALTER TABLE "QuestionBankAudit" ADD CONSTRAINT "QuestionBankAudit_entity" CHECK ("entity" IN ('ITEM', 'REVIEWER', 'SETTING'));
-- Every change to a switch needs a fresh re-authentication (decision D3): a SETTING row says when the person last proved who they are.
ALTER TABLE "QuestionBankAudit" ADD CONSTRAINT "QuestionBankAudit_step_up" CHECK ("entity" <> 'SETTING' OR "stepUpVerifiedAt" IS NOT NULL);
ALTER TABLE "QuestionBankSetting" ADD CONSTRAINT "QuestionBankSetting_key" CHECK (length("key") BETWEEN 1 AND 80 AND "key" LIKE 'bank.%');

-- One row per person, campus, scope and subject; one value per school, campus and key. The columns are nullable (a NULL never equals a NULL), so the indexes compare their
-- COALESCEd values ('' = every campus of the school).
CREATE UNIQUE INDEX "QuestionBankReviewer_once" ON "QuestionBankReviewer"("tenantId", "userId", COALESCE("campusId", ''), "scope", COALESCE("subjectKey", ''));
CREATE UNIQUE INDEX "QuestionBankSetting_once" ON "QuestionBankSetting"("tenantId", COALESCE("campusId", ''), "key");

-- At most 4 images per item. The parent row is locked first so two concurrent inserts cannot both see room for the last slot.
CREATE FUNCTION "question_bank_image_limit"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."itemId" = OLD."itemId" THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM "QuestionBankItem" WHERE "tenantId" = NEW."tenantId" AND "id" = NEW."itemId" FOR UPDATE;
  IF (SELECT count(*) FROM "QuestionBankImage" WHERE "tenantId" = NEW."tenantId" AND "itemId" = NEW."itemId") >= 4 THEN
    RAISE EXCEPTION 'A question bank item can have at most 4 images' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "QuestionBankImage_limit" BEFORE INSERT OR UPDATE OF "itemId" ON "QuestionBankImage" FOR EACH ROW EXECUTE FUNCTION "question_bank_image_limit"();

-- The review history, the versions and the audit trail are append-only.
-- pg_trigger_depth() > 1 means the DELETE came from a foreign-key cascade (the whole school being removed, which the owner role does in tests and when a school is closed),
-- as in the locks of ADR 0003: that is not "someone editing history". A direct UPDATE or DELETE is refused.
CREATE FUNCTION "question_bank_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER "QuestionBankReview_append_only" BEFORE UPDATE OR DELETE ON "QuestionBankReview" FOR EACH ROW EXECUTE FUNCTION "question_bank_append_only"();
CREATE TRIGGER "QuestionBankItemVersion_append_only" BEFORE UPDATE OR DELETE ON "QuestionBankItemVersion" FOR EACH ROW EXECUTE FUNCTION "question_bank_append_only"();
CREATE TRIGGER "QuestionBankAudit_append_only" BEFORE UPDATE OR DELETE ON "QuestionBankAudit" FOR EACH ROW EXECUTE FUNCTION "question_bank_append_only"();

-- Visibility only moves forward: TEACHERS_ONLY -> TEACHERS_ONLY_UNTIL -> PRACTICE, never back; a date that has passed cannot be pushed into the future; a date that is set or
-- moved must be in the future (an already-passed date is PRACTICE, said plainly). TEACHERS_ONLY_UNTIL has a date and nothing else does. Retiring is a status change, not a
-- visibility change, so it is not affected.
ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_until" CHECK (("visibility" = 'TEACHERS_ONLY_UNTIL') = ("visibleFrom" IS NOT NULL));

CREATE FUNCTION "question_bank_visibility_forward"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_rank integer;
  new_rank integer;
  -- "visibleFrom" is a TIMESTAMP without a time zone that holds UTC (that is how Prisma writes it); now() is compared in the session's zone, so on a server set to any zone but
  -- UTC the two were an hour or more apart (found in AlEemaan). Compare like with like.
  utc_now timestamp := (now() AT TIME ZONE 'UTC');
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."visibility" = OLD."visibility" AND NEW."visibleFrom" IS NOT DISTINCT FROM OLD."visibleFrom" THEN
    RETURN NEW; -- nothing about visibility changes
  END IF;

  -- a date that is set or moved is in the future (a date that has passed is PRACTICE, and is set as PRACTICE)
  IF NEW."visibility" = 'TEACHERS_ONLY_UNTIL'
     AND (TG_OP = 'INSERT' OR OLD."visibility" <> 'TEACHERS_ONLY_UNTIL' OR NEW."visibleFrom" IS DISTINCT FROM OLD."visibleFrom")
     AND NEW."visibleFrom" <= utc_now THEN
    RAISE EXCEPTION 'The date a question becomes visible must be in the future' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_rank := CASE OLD."visibility" WHEN 'TEACHERS_ONLY' THEN 0 WHEN 'TEACHERS_ONLY_UNTIL' THEN 1 ELSE 2 END;
    new_rank := CASE NEW."visibility" WHEN 'TEACHERS_ONLY' THEN 0 WHEN 'TEACHERS_ONLY_UNTIL' THEN 1 ELSE 2 END;
    IF new_rank < old_rank THEN
      RAISE EXCEPTION 'A question may appear later, never disappear: visibility only moves forward' USING ERRCODE = 'check_violation';
    END IF;
    -- its date has passed, so pupils can already see it: it cannot be pushed back (the check above already refused a new date in the past)
    IF OLD."visibility" = 'TEACHERS_ONLY_UNTIL' AND OLD."visibleFrom" <= utc_now AND NEW."visibility" = 'TEACHERS_ONLY_UNTIL' THEN
      RAISE EXCEPTION 'A question may appear later, never disappear: its date has passed' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "QuestionBankItem_visibility_forward" BEFORE INSERT OR UPDATE OF "visibility", "visibleFrom" ON "QuestionBankItem" FOR EACH ROW EXECUTE FUNCTION "question_bank_visibility_forward"();

-- An approved or retired item says who approved it and when, and a retired item says why.
ALTER TABLE "QuestionBankItem" ADD CONSTRAINT "QuestionBankItem_decided" CHECK (
  ("status" NOT IN ('APPROVED', 'RETIRED') OR ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL))
  AND ("status" <> 'RETIRED' OR length(btrim(COALESCE("retiredReason", ''), E' \t\r\n\f\v\u00a0')) > 0)
);

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Row-level security, as on every school table (ADR 0001), enabled and forced in this file. What each table may do is what its policies allow: items are read, written and
-- edited and never deleted; images, class tags and overlap flags are replaced as sets; reviews, versions and the audit trail are only ever added to; reviewers are added and
-- removed; settings are set, changed and cleared.

ALTER TABLE "QuestionBankItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuestionBankItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY question_bank_item_read ON "QuestionBankItem" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY question_bank_item_insert ON "QuestionBankItem" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY question_bank_item_update ON "QuestionBankItem" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "QuestionBankImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuestionBankImage" FORCE ROW LEVEL SECURITY;
CREATE POLICY question_bank_image_read ON "QuestionBankImage" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY question_bank_image_insert ON "QuestionBankImage" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY question_bank_image_delete ON "QuestionBankImage" FOR DELETE USING ("tenantId" = app_tenant_id());

ALTER TABLE "QuestionBankItemVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuestionBankItemVersion" FORCE ROW LEVEL SECURITY;
CREATE POLICY question_bank_item_version_read ON "QuestionBankItemVersion" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY question_bank_item_version_insert ON "QuestionBankItemVersion" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "QuestionBankClassTag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuestionBankClassTag" FORCE ROW LEVEL SECURITY;
CREATE POLICY question_bank_class_tag_read ON "QuestionBankClassTag" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY question_bank_class_tag_insert ON "QuestionBankClassTag" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY question_bank_class_tag_delete ON "QuestionBankClassTag" FOR DELETE USING ("tenantId" = app_tenant_id());

ALTER TABLE "QuestionBankReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuestionBankReview" FORCE ROW LEVEL SECURITY;
CREATE POLICY question_bank_review_read ON "QuestionBankReview" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY question_bank_review_insert ON "QuestionBankReview" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "QuestionBankReviewer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuestionBankReviewer" FORCE ROW LEVEL SECURITY;
CREATE POLICY question_bank_reviewer_read ON "QuestionBankReviewer" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY question_bank_reviewer_insert ON "QuestionBankReviewer" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY question_bank_reviewer_delete ON "QuestionBankReviewer" FOR DELETE USING ("tenantId" = app_tenant_id());

ALTER TABLE "QuestionOverlapFlag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuestionOverlapFlag" FORCE ROW LEVEL SECURITY;
CREATE POLICY question_overlap_flag_read ON "QuestionOverlapFlag" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY question_overlap_flag_insert ON "QuestionOverlapFlag" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY question_overlap_flag_delete ON "QuestionOverlapFlag" FOR DELETE USING ("tenantId" = app_tenant_id());

ALTER TABLE "QuestionBankAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuestionBankAudit" FORCE ROW LEVEL SECURITY;
CREATE POLICY question_bank_audit_read ON "QuestionBankAudit" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY question_bank_audit_insert ON "QuestionBankAudit" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());

ALTER TABLE "QuestionBankSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuestionBankSetting" FORCE ROW LEVEL SECURITY;
CREATE POLICY question_bank_setting_read ON "QuestionBankSetting" FOR SELECT USING ("tenantId" = app_tenant_id());
CREATE POLICY question_bank_setting_insert ON "QuestionBankSetting" FOR INSERT WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY question_bank_setting_update ON "QuestionBankSetting" FOR UPDATE USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());
CREATE POLICY question_bank_setting_delete ON "QuestionBankSetting" FOR DELETE USING ("tenantId" = app_tenant_id());
