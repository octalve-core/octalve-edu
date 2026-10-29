-- Additive migration for extended fields on StaffRecord, GuardianRecord, and StudentRecord.
-- Introduces Gender enum, employee HR details (middle name, gender, DOB, address, designation, qualification, employment date, next of kin),
-- and guardian details (middle name, address, occupation).

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- AlterTable StaffRecord
ALTER TABLE "StaffRecord"
    ADD COLUMN "middleName" TEXT,
    ADD COLUMN "gender" "Gender",
    ADD COLUMN "dateOfBirth" DATE,
    ADD COLUMN "address" TEXT,
    ADD COLUMN "designation" TEXT,
    ADD COLUMN "qualification" TEXT,
    ADD COLUMN "employmentDate" DATE,
    ADD COLUMN "nextOfKinName" TEXT,
    ADD COLUMN "nextOfKinRelationship" TEXT,
    ADD COLUMN "nextOfKinPhone" TEXT,
    ADD COLUMN "nextOfKinAddress" TEXT;

-- AlterTable GuardianRecord
ALTER TABLE "GuardianRecord"
    ADD COLUMN "middleName" TEXT,
    ADD COLUMN "address" TEXT,
    ADD COLUMN "occupation" TEXT;

-- AlterTable StudentRecord
ALTER TABLE "StudentRecord"
    ADD COLUMN "gender" "Gender";

-- Add check constraints for clean data shapes
ALTER TABLE "StaffRecord"
    ADD CONSTRAINT "StaffRecord_middle_name_valid" CHECK ("middleName" IS NULL OR length(btrim("middleName")) BETWEEN 1 AND 80),
    ADD CONSTRAINT "StaffRecord_birth_date_floor" CHECK ("dateOfBirth" IS NULL OR "dateOfBirth" >= DATE '1900-01-01'),
    ADD CONSTRAINT "StaffRecord_employment_date_floor" CHECK ("employmentDate" IS NULL OR "employmentDate" >= DATE '1900-01-01'),
    ADD CONSTRAINT "StaffRecord_nok_phone_shape" CHECK ("nextOfKinPhone" IS NULL OR ("nextOfKinPhone" ~ '^[0-9+() -]{7,20}$'));

ALTER TABLE "GuardianRecord"
    ADD CONSTRAINT "GuardianRecord_middle_name_valid" CHECK ("middleName" IS NULL OR length(btrim("middleName")) BETWEEN 1 AND 80);
