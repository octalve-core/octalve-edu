-- Task 0048 (decision of the maintainer on the 0032 points, 2026-11-11): a school names the exam part of its assessment scheme.
--
-- Until now the exam part of a mark was always called "Exam" (or "Final exam", "Examination", "Exam 2"... when a component already took the name). A school can now name it ("Final Examination",
-- "Endterm"). The column is NULLABLE and has no default: null means "the default name", so every scheme that exists keeps the parts it had and every saved result keeps matching its scheme.
--
-- ADDITIVE ONLY: one nullable column, one check constraint on a column that is null everywhere, and the locked-scheme guard replaced by a copy that also protects the new column. Nothing is
-- dropped, renamed, backfilled or rewritten. Safe to run before or after the code that uses it is deployed (the old code ignores the column; the new code reads null as "Exam").

ALTER TABLE "AssessmentScheme" ADD COLUMN "examName" TEXT;

-- 1 to 40 characters once trimmed, the same bound as a component's name. (The application also collapses runs of whitespace and refuses a name that a component already has.)
ALTER TABLE "AssessmentScheme"
  ADD CONSTRAINT "AssessmentScheme_examName_length" CHECK ("examName" IS NULL OR char_length(btrim("examName")) BETWEEN 1 AND 40);

-- A locked scheme (a result references it) keeps its name, totals, exam name, version, scope and lock forever; only archiving (archivedAt) and updatedAt may change. The same function as before with
-- "examName" added to the protected fields; IS DISTINCT FROM treats null as a value, so null -> "Endterm" is a change and null -> null is not.
CREATE OR REPLACE FUNCTION assessment_scheme_locked_guard() RETURNS trigger LANGUAGE plpgsql AS
$$
BEGIN
  IF OLD."lockedAt" IS NOT NULL AND (NEW."name", NEW."totalMax", NEW."examMax", NEW."examName", NEW."version", NEW."classGroupId", NEW."supersedesId", NEW."lockedAt")
     IS DISTINCT FROM (OLD."name", OLD."totalMax", OLD."examMax", OLD."examName", OLD."version", OLD."classGroupId", OLD."supersedesId", OLD."lockedAt") THEN
    RAISE EXCEPTION 'assessment scheme % is locked: a change is a new version', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
