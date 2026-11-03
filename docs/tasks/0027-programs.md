# 0027: Programs (learning that is not a normal class) - the Octalve Edu port of AlEemaan's task 0043

- **Period / Focus:** design written 2026-11-04 (docs only); requested by the maintainer on 2026-11-03 for AlEemaan, and parity for Octalve Edu was always the next step. The source is AlEemaan's `docs/tasks/0043-programs.md` (slice P1 built and tested on its branch `claude/programs-p1`; slice P2, people, designed in its section 9).
- **Status:** Design only. Nothing is built here. Start when AlEemaan's slices P1 and P2 are merged into its `dev`, so there is something to port.
- **Priority:** Medium
- **Assignee:** next AI / maintainer
- **Target Branch / PR:** one branch and one PR per slice, off `dev`

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
A program is learning that is not a normal class (a Quran memorisation program that never ends, a three-year course): it has its own levels (1 to 4 names the program chooses), a tree of groups, its own people and staff, and is run by the school's administrator plus a program admin they name. Octalve Edu gets the same, on its own foundations: a school (`Tenant`) with campuses, row-level security, composite foreign keys.

## 2. What is the same, and what is not (read from the code on 2026-11-04)
Same (see AlEemaan's 0043 for the reasoning): the program's kind (ongoing or fixed-term, the end date is start + duration - 1 day), the status flow (`DRAFT`, `ACTIVE`, `ARCHIVED`; `COMPLETED` only by the completion slice), up to four level names, the group tree with its rules (unique live names, no archiving a group with a live group inside), nothing hard-deleted (ADR 0004), an append-only audit, a 404 for a program the caller has no place in, hiding a button is a courtesy.

Different, on purpose:
1. **Tenant and RLS.** Every new table carries `tenantId`, has row-level security enabled and forced, and uses composite foreign keys (ADR 0001); the routes live under `/api/v1/schools/[code]/programs` and the pages under `/schools/[code]/programs` (the school's code is in the URL), and run inside `forTenant(tenantId)`. A source test (`tests/unit/route-role-guard.spec.ts`) fails a route that does not say who may call it, so every program route declares its roles.
2. **Campuses, not branches.** A school can have no campuses at all (`SchoolSettings.multiCampusEnabled` is false by default and `Campus` is optional on people). A program therefore either runs **school-wide** (no campus list: the only option for a school with no campuses) or in **chosen campuses** (`ProgramCampus`, one or more). A program can be created with a campus of its own (a real `Campus` row, only when `multiCampusEnabled` is on).
3. **Roles.** `ADMIN` is the school-wide administrator (AlEemaan's super admin); `CAMPUS_ADMIN` runs one campus (AlEemaan's branch admin; ADR 0016: a row of another campus is a 404, a school-wide row is not theirs). Only an `ADMIN` creates a program and names its program admins. A program admin must hold an **active** membership (not deactivated) with a staff role whose campus is empty or one of the program's campuses; the authority is read at every request, so deactivating the membership ends it at once.
4. **One membership per person per school** (`@@unique([userId, tenantId])`), with an optional campus. So "a person through a campus" is the **record's** campus (`StudentRecord.campusId`, `StaffRecord.campusId`, both nullable). A person whose record has no campus is "through the school": only an `ADMIN` or a program admin handles them, and a campus administrator never sees them.
5. **Guardians are real records here** (`GuardianRecord`, linked to students). So the participant kinds are `STUDENT`, `STAFF`, `GUARDIAN` (linked to a `GuardianRecord`), and the standalone `ADULT` and `CHILD`.
6. **The ceiling switch needs a settings store that Octalve does not have.** `SchoolSettings` is typed columns, one row per school; the only key and value store with a campus is `QuestionBankSetting`. The first slice adds one small generic table (tenant, optional campus, key, JSON value, updated by) with RLS, which the programs switch (`programs.enabled`: the school's value AND the campus's, a campus can only turn it off), the standing switch (task 0028) and the part-payment rule (task 0029) all use. A change of a school-wide value uses the existing step-up proof of the settings screen (it is the safer reading of PRD section 14); a campus narrowing does not.
7. **Where it sits in the sidebar.** `navFor(school, platform)` is role-based and carries a section per entry: Programs goes in **Learning**, for every staff role, kept in step with AlEemaan's Classroom section.

## 3. Open points to settle before building (defaults are used unless the maintainer changes them)
- **Overlap with Phase 5.** `SchoolType` has `VOCATIONAL` (cohorts) and `HIGHER_ED` (credit units) and task 0015 built certifications. Before slice P1, read `higher_ed.prisma` and task 0015 and decide what a program is *not* (default: a program never replaces an academic period or a credit-bearing course; it is for what those do not cover).
- **Certificates** (slice P5) reuse `src/lib/certificates` (task 0018: verification by token, numbers per school).
- **Programs may have assessments** (AlEemaan's 0043 section 8.11, slice P3b): ported with the same slice.

## 4. Work breakdown
- [ ] P0 The generic tenant-and-campus settings table, its RLS and audit, and the switch helper (shared with 0028 and 0029)
- [ ] P1 Structure (programs, campuses, level names, groups, program admins, the audit, the `programs.enabled` switch, the Programs page, the sidebar entry)
- [ ] P2 People (`ProgramParticipant`, the state of a place read from the school's own records, standing for standalone people, the People tab; AlEemaan's 0043 section 9)
- [ ] P3 Staff and attendance - [ ] P3b Assessments - [ ] P4 Fees - [ ] P5 Completion and certificates (each as in AlEemaan's 0043)
- [ ] Tests: unit, API (who may, tenant isolation, campus isolation), integration (RLS, the checks), browser (both themes, phone), the route-role-guard source test, walkthrough rows

## 5. Not in this task
Anything AlEemaan's 0043 puts out of scope. Progress records (AlEemaan's 0044) are a separate port.
