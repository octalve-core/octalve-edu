-- Campus administrators (plan C2, ADR 0016). ADDITIVE: one enum value. It is its OWN migration because Postgres refuses to USE a newly added
-- enum value in the transaction that adds it; the CHECK constraint that mentions it is in the next migration. No row changes: every existing
-- ADMIN stays exactly what it was. Run this BEFORE the code that names the value (ADR 0003 of AlEemaan / this repo's additive-migration rule).

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CAMPUS_ADMIN';
