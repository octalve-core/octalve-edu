# 0014: Phase 4 — Learning Management System (LMS), Assignments & Course Materials

- **Period / Focus:** 2026-10-16 onwards (LMS, Assignments, Digital Submissions, Course Materials & Quiz Grading)
- **Status:** Complete
- **Priority:** High
- **Assignee:** Antigravity / Engineering Team
- **Target Branch / PR:** [PR #20](https://github.com/octalve-core/octalve-edu/pull/20) (`claude/phase-4-lms-assignments` -> `dev`)
- **Started:** 2026-10-16 14:30:00 UTC
- **Ended:** 2026-10-16 15:45:00 UTC
- **Duration:** 1h 15m

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Deliver a comprehensive, tenant-isolated **Learning Management System (LMS)** module for Octalve Edu. This empowers teachers and academic coordinators to create digital assignments, distribute rich course notes and learning materials, track and grade student homework submissions with qualitative feedback, and conduct self-assessing online quizzes. The module seamlessly links into student enrollments, subject assignments, and the academic calendar with complete PostgreSQL Row-Level Security (RLS) enforcement.

---

## 2. Architectural Context & Design Thoughts

### A. Tenancy & Isolation
- All tables (`Assignment`, `AssignmentSubmission`, `LearningMaterial`, `Quiz`, `QuizQuestion`, `QuizAttempt`) carry `tenantId` and strict composite foreign keys on `[tenantId, parentId]`.
- Enforced PostgreSQL Row-Level Security:
  ```sql
  ALTER TABLE "Assignment" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "Assignment" FORCE ROW LEVEL SECURITY;
  CREATE POLICY "tenant_isolation" ON "Assignment"
    USING ("tenantId" = current_setting('app.tenant_id', true));
  ```
- No hard deletes: assignments and materials are soft-archived via `archivedAt DateTime?`.

### B. Core Sub-Modules
1. **Assignments & Homework:**
   - Scopeable to either a full `ClassGroup` (e.g. all of JSS 1) or a specific `ClassArm` (e.g. JSS 1-A).
   - Linked to a `Subject` and assigned `StaffRecord`.
   - Rich instructions, due dates, late-submission allowances, attachments JSON (links/resources).
   - Points scale (e.g., total 20 marks, 50 marks, or 100 marks).
2. **Submissions & Speed Grading:**
   - One active submission record per student per assignment (`@@unique([tenantId, assignmentId, studentId])`).
   - Status transitions: `PENDING` → `SUBMITTED` / `LATE` → `GRADED` / `RESUBMIT_REQUESTED`.
   - Teacher grading drawer: point score entry, qualitative feedback, grader attribution, and timestamp.
3. **Course Materials & Resource Repository:**
   - Digital repository for syllabus notes, revision slides, reference links, and reading materials by class group and subject.
   - Searchable and categorized by subject and academic term.
4. **Online Quizzes & Self-Assessments:**
   - Timed or open quizzes composed of multiple choice, true/false, and short answer questions.
   - Instant automated scoring for objective questions with performance summary.

---

## 3. Work Breakdown

- [x] **Sub-phase A: Data Architecture & Schema**
  - [x] Create `prisma/schema/lms.prisma` with `Assignment`, `AssignmentSubmission`, `LearningMaterial`, `Quiz`, `QuizQuestion`, `QuizAttempt`
  - [x] Add relational fields to `academics.prisma` (`Subject`, `ClassGroup`, `ClassArm`) and `people.prisma` (`StudentRecord`, `StaffRecord`)
  - [x] Run `pnpm prisma generate` to update Prisma Client

- [x] **Sub-phase B: Database Migrations & RLS Policies**
  - [x] Generate migration SQL script
  - [x] Add `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and `tenant_isolation` policies for all 6 tables
  - [x] Verify zero-leakage RLS guarantees

- [x] **Sub-phase C: Pure Domain Rules & Validation**
  - [x] Implement `src/lib/lms/rules.ts` (submission status rules, late detection, score validation, percentage computation)
  - [x] Implement `src/lib/lms/validation.ts` (Zod schemas for assignment creation, material upload, submission, grading, and quiz generation)

- [x] **Sub-phase D: API Endpoints (`/api/v1/schools/[code]/lms/`)**
  - [x] `/api/v1/schools/[code]/lms/assignments` (GET list, POST create)
  - [x] `/api/v1/schools/[code]/lms/assignments/[id]` (GET detail, PATCH update/publish, DELETE archive)
  - [x] `/api/v1/schools/[code]/lms/assignments/[id]/submissions` (POST student submission)
  - [x] `/api/v1/schools/[code]/lms/assignments/[id]/submissions/[submissionId]/grade` (PATCH grade and feedback)
  - [x] `/api/v1/schools/[code]/lms/materials` (GET list, POST create, DELETE archive)
  - [x] `/api/v1/schools/[code]/lms/quizzes` & `/api/v1/schools/[code]/lms/quizzes/[id]/attempt` (GET, POST quiz, POST attempt & auto-grade)

- [x] **Sub-phase E: UI Consoles & Shell Integration**
  - [x] Add "LMS & Assignments" section to Academics & dedicated `/schools/[code]/lms` route
  - [x] Build Assignments Hub with filterable cards, due dates, and status badges
  - [x] Build Assignment Creator Dialog with accessible form controls and WCAG 2.2 AA compliant tokens
  - [x] Build Speed-Grader Submission Review Drawer with live grade calculation
  - [x] Build Learning Materials Hub and Online Quizzes list
  - [x] Build E2E accessibility suite (`tests/e2e/lms-a11y.spec.ts`) passing Axe WCAG 2.2 audits

- [x] **Sub-phase F: Testing & Quality Gates**
  - [x] Unit tests for LMS rules and score computations (`tests/unit/lms-rules.spec.ts` - 13/13 passed)
  - [x] API integration tests for assignments, submissions, grading, and tenant boundaries (`tests/api/lms.spec.ts` - 11/11 passed)
  - [x] Typecheck (`pnpm typecheck`), linting (`pnpm lint`), and production build (`pnpm build`) verification (0 errors, 0 warnings)
