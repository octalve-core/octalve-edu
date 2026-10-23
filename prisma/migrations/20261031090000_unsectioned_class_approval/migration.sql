-- ADR 0018, amendment of 2026-10-23: whether an approver with a Section scope may also act on the class groups that have no section is a school setting.
-- Additive: one enum and one column with a default, so every school keeps today's behaviour (a class group with no section is reached only through a General scope
-- or a Class scope on it) until its administrator changes it. The code that names the column needs this migration first.

CREATE TYPE "UnsectionedClassApproval" AS ENUM ('GENERAL_OR_CLASS_ONLY', 'ANY_SECTION_APPROVER');

ALTER TABLE "SchoolSettings" ADD COLUMN "unsectionedClassApproval" "UnsectionedClassApproval" NOT NULL DEFAULT 'GENERAL_OR_CLASS_ONLY';
