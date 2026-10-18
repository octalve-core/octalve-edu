-- Phase 5 — Higher-Ed Credit Unit System, Custom Domains & Vocational Certifications
-- ADDITIVE ONLY. Multi-tenant RLS policies and runtime locks included.

-- CreateEnums
CREATE TYPE "DomainStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'FAILED');
CREATE TYPE "CourseRegStatus" AS ENUM ('REGISTERED', 'DROPPED', 'COMPLETED');
CREATE TYPE "CertificateStatus" AS ENUM ('DRAFT', 'ISSUED', 'REVOKED');

-- CreateTable: CustomDomain
CREATE TABLE "CustomDomain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "DomainStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verificationToken" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "sslActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Department
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Course
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "creditUnits" INTEGER NOT NULL DEFAULT 3,
    "level" INTEGER NOT NULL DEFAULT 100,
    "semester" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CourseRegistration
CREATE TABLE "CourseRegistration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "status" "CourseRegStatus" NOT NULL DEFAULT 'REGISTERED',
    "creditUnits" INTEGER NOT NULL,
    "score" DECIMAL(5,2),
    "grade" TEXT,
    "gradePoint" DECIMAL(3,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Certificate
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "periodId" TEXT,
    "title" TEXT NOT NULL,
    "certificateNo" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationHash" TEXT NOT NULL,
    "metadata" JSONB,
    "status" "CertificateStatus" NOT NULL DEFAULT 'ISSUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- Indices & Constraints
CREATE UNIQUE INDEX "CustomDomain_domain_key" ON "CustomDomain"("domain");
CREATE UNIQUE INDEX "CustomDomain_tenantId_id_key" ON "CustomDomain"("tenantId", "id");
CREATE INDEX "CustomDomain_tenantId_idx" ON "CustomDomain"("tenantId");

CREATE UNIQUE INDEX "Department_tenantId_id_key" ON "Department"("tenantId", "id");
CREATE UNIQUE INDEX "Department_tenantId_code_key" ON "Department"("tenantId", "code");
CREATE INDEX "Department_tenantId_idx" ON "Department"("tenantId");

CREATE UNIQUE INDEX "Course_tenantId_id_key" ON "Course"("tenantId", "id");
CREATE UNIQUE INDEX "Course_tenantId_code_key" ON "Course"("tenantId", "code");
CREATE INDEX "Course_tenantId_idx" ON "Course"("tenantId");
CREATE INDEX "Course_departmentId_idx" ON "Course"("departmentId");

CREATE UNIQUE INDEX "CourseRegistration_tenantId_studentId_courseId_periodId_key" ON "CourseRegistration"("tenantId", "studentId", "courseId", "periodId");
CREATE INDEX "CourseRegistration_tenantId_idx" ON "CourseRegistration"("tenantId");
CREATE INDEX "CourseRegistration_studentId_idx" ON "CourseRegistration"("studentId");
CREATE INDEX "CourseRegistration_courseId_idx" ON "CourseRegistration"("courseId");
CREATE INDEX "CourseRegistration_periodId_idx" ON "CourseRegistration"("periodId");

CREATE UNIQUE INDEX "Certificate_certificateNo_key" ON "Certificate"("certificateNo");
CREATE INDEX "Certificate_tenantId_idx" ON "Certificate"("tenantId");
CREATE INDEX "Certificate_studentId_idx" ON "Certificate"("studentId");
CREATE INDEX "Certificate_verificationHash_idx" ON "Certificate"("verificationHash");

-- Foreign Keys
ALTER TABLE "CustomDomain" ADD CONSTRAINT "CustomDomain_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Department" ADD CONSTRAINT "Department_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Course" ADD CONSTRAINT "Course_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Course" ADD CONSTRAINT "Course_tenantId_departmentId_fkey" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "Department"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourseRegistration" ADD CONSTRAINT "CourseRegistration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseRegistration" ADD CONSTRAINT "CourseRegistration_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "StudentRecord"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseRegistration" ADD CONSTRAINT "CourseRegistration_tenantId_courseId_fkey" FOREIGN KEY ("tenantId", "courseId") REFERENCES "Course"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseRegistration" ADD CONSTRAINT "CourseRegistration_tenantId_periodId_fkey" FOREIGN KEY ("tenantId", "periodId") REFERENCES "AcademicPeriod"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "StudentRecord"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_tenantId_periodId_fkey" FOREIGN KEY ("tenantId", "periodId") REFERENCES "AcademicPeriod"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security: CustomDomain
ALTER TABLE "CustomDomain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomDomain" FORCE ROW LEVEL SECURITY;
CREATE POLICY custom_domain_tenant_isolation ON "CustomDomain" FOR ALL TO app_user
    USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

-- Row-Level Security: Department
ALTER TABLE "Department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Department" FORCE ROW LEVEL SECURITY;
CREATE POLICY department_tenant_isolation ON "Department" FOR ALL TO app_user
    USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

-- Row-Level Security: Course
ALTER TABLE "Course" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Course" FORCE ROW LEVEL SECURITY;
CREATE POLICY course_tenant_isolation ON "Course" FOR ALL TO app_user
    USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

-- Row-Level Security: CourseRegistration
ALTER TABLE "CourseRegistration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseRegistration" FORCE ROW LEVEL SECURITY;
CREATE POLICY course_registration_tenant_isolation ON "CourseRegistration" FOR ALL TO app_user
    USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

-- Row-Level Security: Certificate
ALTER TABLE "Certificate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Certificate" FORCE ROW LEVEL SECURITY;
CREATE POLICY certificate_tenant_isolation ON "Certificate" FOR ALL TO app_user
    USING ("tenantId" = app_tenant_id()) WITH CHECK ("tenantId" = app_tenant_id());

-- Owner policies for migrator / system superuser
DO $$
BEGIN
  EXECUTE format('CREATE POLICY custom_domain_owner ON "CustomDomain" FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
  EXECUTE format('CREATE POLICY department_owner ON "Department" FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
  EXECUTE format('CREATE POLICY course_owner ON "Course" FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
  EXECUTE format('CREATE POLICY course_registration_owner ON "CourseRegistration" FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
  EXECUTE format('CREATE POLICY certificate_owner ON "Certificate" FOR ALL TO %I USING (true) WITH CHECK (true)', current_user);
END
$$;

-- Grant runtime role app_user permissions on the new Phase 5 tables
SELECT app_grant_runtime_privileges();
