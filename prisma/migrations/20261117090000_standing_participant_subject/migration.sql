-- Programs, slice P2 (task 0027), step 1 of 2: the history of standing gains the subject PARTICIPANT (a person typed into a program who has no school record).
--
-- ADDITIVE ONLY, and a migration of its own on purpose: PostgreSQL cannot use an enum value in the transaction that added it, and step 2 (20261117100000_program_people) re-creates the checks
-- that name it. Nothing that exists reads the new value, so this can be run before the code that uses it is deployed.

-- AlterEnum
ALTER TYPE "StandingSubject" ADD VALUE 'PARTICIPANT';
