# 0015: Phase 5 — Higher-Ed Credit Unit System, Custom Domains & Vocational Certifications

- **Period / Focus:** 2026-10-18 onwards (Higher-Ed Courses & Credit Units, Tenant Custom Domains / White-Labeling, Vocational Certification Issuance)
- **Status:** [x] Completed
- **Priority:** High
- **Assignee:** Antigravity / Engineering Team
- **Target Branch / PR:** `claude/phase-5-expansion` -> `dev`
- **Started:** 2026-10-18 01:00:00 UTC
- **Ended:** 2026-10-18 01:30:00 UTC
- **Duration:** 30m

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Deliver Phase 5 multi-tenant expansion for Octalve Edu to support tertiary institutions (`HIGHER_ED`), vocational academies (`VOCATIONAL`), and enterprise white-labeling:
1. **Higher-Ed Credit Unit System:** Departments, semester-based courses with credit weightings, level tags (100–500), course registrations, and automated Grade Point Average (GPA / CGPA on a 5.0 scale) computation.
2. **Tenant Custom Domains / White-Labeling:** Multi-tenant domain registration, cryptographic TXT verification tokens, CNAME verification engine, and domain routing resolution.
3. **Vocational Certifications:** Credential issuance engine, tamper-evident SHA-256 certificate hashing, unique serial generation, and public token verification lookup.

---

## 2. Architectural Context & Design Thoughts

### A. Multi-Tenancy & Row-Level Security
- Every table (`CustomDomain`, `Department`, `Course`, `CourseRegistration`, `Certificate`) carries `tenantId String` with strict foreign key linkage to `Tenant(id)` on cascade delete.
- Composite foreign keys on `[tenantId, parentId]`.
- Strict PostgreSQL Row-Level Security enabled and forced:
  ```sql
  ALTER TABLE "CustomDomain" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "CustomDomain" FORCE ROW LEVEL SECURITY;
  CREATE POLICY "tenant_isolation" ON "CustomDomain"
    USING ("tenantId" = current_setting('app.tenant_id', true));
  ```

### B. Core Sub-Modules
1. **Custom Domains:**
   - Model `CustomDomain`: `id`, `tenantId`, `domain` (lowercase, FQDN), `status` (`PENDING`, `ACTIVE`, `FAILED`), `verificationToken`, `verifiedAt`, `sslActive`.
   - Security: Prevents apex/root hijacking, reserved subdomain bans (`api`, `app`, `admin`, `auth`, `platform`, `staging`).
2. **Higher-Ed Departments & Courses:**
   - Model `Department`: `id`, `tenantId`, `name`, `code`.
   - Model `Course`: `id`, `tenantId`, `departmentId`, `code` (e.g. `CSC101`), `title`, `creditUnits` (1–6), `level` (100–500), `semester` (1 or 2).
   - Model `CourseRegistration`: `id`, `tenantId`, `studentId`, `courseId`, `periodId`, `status` (`REGISTERED`, `DROPPED`, `COMPLETED`), `score`, `grade`, `gradePoint`.
   - GPA engine: `Total Quality Points (∑(creditUnits × gradePoint)) / Total Registered Credits`.
3. **Vocational Certifications:**
   - Model `Certificate`: `id`, `tenantId`, `studentId`, `periodId`, `title`, `certificateNo`, `issueDate`, `verificationHash` (SHA-256), `status` (`DRAFT`, `ISSUED`, `REVOKED`).
   - Public token verification lookup endpoint with rate limiting.

---

## 3. Work Breakdown

- [x] **Architectural Guard Fixes & Baseline Green**
  - [x] Register support areas (`area: "academics"`) on LMS GET routes in `tests/unit/route-area-guard.spec.ts`
  - [x] Register out-of-reach reasons for communication GET routes in `route-area-guard.spec.ts`
  - [x] Register communication & LMS handlers in `CAMPUS_CHECKED_ELSEWHERE` in `route-role-guard.spec.ts`
  - [x] Verify all 365 unit tests pass green

- [x] **Sub-phase A: Data Architecture & Prisma Schema**
  - [x] Add `CustomDomain` to `prisma/schema/tenancy.prisma`
  - [x] Create `prisma/schema/higher_ed.prisma` with `Department`, `Course`, `CourseRegistration`, and `Certificate`
  - [x] Generate Prisma client with `pnpm prisma:generate`

- [x] **Sub-phase B: Database Migration & Multi-Tenant RLS**
  - [x] Generate migration with PostgreSQL RLS policies (`20261027090000_phase_5_expansion/migration.sql`)
  - [x] Verify multi-tenant row isolation across all newly introduced tables

- [x] **Sub-phase C: Pure Domain Rules & Engines**
  - [x] `src/lib/higher-ed/rules.ts` (GPA/CGPA computation, credit limits 12–24, score-to-grade point mapping)
  - [x] `src/lib/domains/rules.ts` (FQDN validation, reserved subdomain prevention, token generation)
  - [x] `src/lib/certificates/rules.ts` (Certificate SHA-256 fingerprinting, certificate number generation)

- [x] **Sub-phase D: Domain Services**
  - [x] `src/lib/higher-ed/service.ts` (Department, Course, CourseRegistration, GPA calculation)
  - [x] `src/lib/domains/service.ts` (Domain registration, verification workflow, DNS check mock)
  - [x] `src/lib/certificates/service.ts` (Certificate issuance, verification lookup, revocation)

- [x] **Sub-phase E: API Endpoints**
  - [x] `/api/v1/schools/[code]/higher-ed/departments` (GET, POST)
  - [x] `/api/v1/schools/[code]/higher-ed/courses` (GET, POST)
  - [x] `/api/v1/schools/[code]/higher-ed/registrations` (GET, POST, PATCH)
  - [x] `/api/v1/schools/[code]/domains` (GET, POST, DELETE)
  - [x] `/api/v1/schools/[code]/domains/[id]/verify` (POST)
  - [x] `/api/v1/schools/[code]/certificates` (GET, POST)
  - [x] `/api/v1/verify-certificate/[certificateNo]` (GET public)

- [x] **Sub-phase F: UI Consoles & Shell Integration**
  - [x] `HigherEdPanel.tsx` (Courses list, Department filter, Credit units summary, GPA calculator)
  - [x] `CustomDomainSettings.tsx` (Domain configuration, DNS instructions, SSL badge)
  - [x] `CertificatesConsole.tsx` (Certificate issuance, SHA-256 badge, revocation)

- [x] **Sub-phase G: Testing, Quality Gates & Sync**
  - [x] Unit tests for GPA calculation, domain validation, and certificate hashing (`tests/unit/phase-5-expansion.spec.ts`)
  - [x] Run `pnpm typecheck` (0 errors), `pnpm format:check` (clean), and `pnpm test:unit` (378/378 passing)
  - [x] Update documentation and master task register
