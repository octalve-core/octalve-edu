# Forms module and Question Bank in Octalve Edu: parity design note

- **Status:** draft for the maintainer, 2026-10-19. No code. Nothing here is built.
- **Canonical design:** AlEemaan's note, `docs/development-history/forms-and-question-bank-design.md` in the AlEemaan repository (roji-tech/AlEemaan). Its behaviour rules apply here unchanged: the principles (section 2), the kinds of thing a teacher can publish (4), exam secrecy (7), the flows (8), abuse controls (11), audit (12), the slice order (13) and the tests (14). This note does NOT repeat them. It maps them onto Octalve's structure and lists what only the maintainer can decide.
- **Built first in AlEemaan.** Slice 1 there is on `claude/forms-qbank-slice-1`; its result and the notes for slice 2 are in AlEemaan's `docs/tasks/0032-forms-and-question-bank.md` section 4a. Octalve's build follows AlEemaan's, slice by slice, and before Octalve's walkthrough (maintainer's order of 2026-10-19).

## 1. How each AlEemaan idea maps onto Octalve

| AlEemaan | Octalve | Consequence |
|---|---|---|
| One school, several `Branch` rows | Many schools (`Tenant`), each with optional `Campus` rows | Every new table carries `tenantId` |
| `branchId` null = general (every branch) | `campusId` null = every campus **of that school** | "General" never crosses a school (decision D1) |
| `Membership` (role, `deactivatedAt`) | `TenantMembership` (role, `permissions`, `campusId`, `deactivatedAt`) | "Active staff" = a membership with `deactivatedAt` null and a staff role |
| Superadmin | School `ADMIN` | School-wide authority |
| Branch administrator | `CAMPUS_ADMIN` (needs a `campusId`) | May only change their own campus; may only narrow |
| (none) | Platform administrator (`User.isPlatformAdmin`) | Has no read access to any school's data (ADR 0016); see section 5 |
| `withAuth` + `withAuthGated(level, ...)` | `withAuth(handler, { tenant: true, roles, permissions, area })` and the `campus-scope.ts` helpers (`createCampus`, `ownCampusOnly`, `judgeCampus`) | Data is reached only through `auth.tenant.run(tx => ...)` |
| Route-role-guard allowlists | The same guard (`tests/unit/route-role-guard.spec.ts`) | Every new route gets an entry with its reason |
| `SettingValue` rows (GLOBAL, BRANCH) | `SchoolSettings`: ONE row per school, typed columns | Decision D3 |
| `QuestionBankReviewer` table | Same table plus `tenantId`; NOT a new `Permission` value | A reviewer has a scope, a subject and an exam-approver flag, which `Permission[]` cannot hold; ADMIN implying every permission (ADR 0006) does not apply to reviewing |
| Portal (guardian's code) for pupil practice | The student's own sign-in (`STUDENT` membership) | No portal-session routes; student routes use `withAuth` with `roles: [STUDENT]` |
| `ClassGroup`, `Subject` per branch | `ClassGroup`, `Subject` with `campusId` (null = every campus) | The same reason for text tags holds: a general item cannot point at one campus's row |

## 2. Rules every Octalve table and route must follow

These come from Octalve's own ADRs and its catalog guard; they are the part with no AlEemaan equivalent.

1. **Row-level security on every table** (ADR 0001): `tenantId` NOT NULL, `ENABLE` and `FORCE ROW LEVEL SECURITY`, and a `<table>_tenant_isolation` policy `FOR ALL TO app_user USING ("tenantId" = app_tenant_id()) WITH CHECK (...)`. `tests/integration/tenant-rls.spec.ts` fails the build if a table with a `tenantId` has none.
2. **Composite keys**: every child references its parent by `(tenantId, id)`, so a row can never point into another school. This is stricter than AlEemaan, where the question bank deliberately uses plain ids (a null `branchId` switches a composite key off). In Octalve the tenant part is never null, so the composite key stays: a general item has `campusId` null and a composite foreign key to `Campus` on `(tenantId, campusId)` that Postgres simply skips when `campusId` is null (the same shape `ClassGroup.campus` already uses).
3. **Data only through `auth.tenant.run`**; no route touches the unscoped client. Routes under `/api/v1/schools/[code]/question-bank/...`.
4. **A refusal after a write must roll back** (ADR 0002): a service that writes and then refuses throws inside the transaction.
5. **Locks are triggers** (ADR 0003) and **archive, never delete** (ADR 0004): the append-only triggers on `QuestionBankReview` and `QuestionBankAudit`, and the image-count trigger, are as in AlEemaan; retiring a question archives it.
6. **A campus administrator's rule is the same answer everywhere**: a row of another campus, or no row, is a 404 that does not confirm it exists; a school-wide row they may see but not change is a 403 (`campus-scope.ts`).
7. **Commit and PR messages** follow ADR 0013 (what, why, decisions, bugs found, tests run and NOT run).

## 3. Decisions for the maintainer

Answered 2026-10-19: D1, D3 and D6 (below). D4 was answered on 2026-10-23 (below): what a parent sees is a school setting, not a fixed choice. D2 and D5 stand as recommended unless the maintainer says otherwise.

- **D1. What "general" means. DECIDED (maintainer, 2026-10-19): school-wide only.** "General" means every campus of ONE school and never crosses a school. A bank shared across schools would break the rule that a school's data is isolated by row-level security and that the platform administrator reads none of it (ADR 0016), and it would put one school's exam questions in front of another's staff, which the exam-secrecy rules exist to prevent. A shared national bank, if ever wanted, is a separate platform feature with its own design.
- **D2. Higher-education and vocational schools.** Tags are text (a label as typed plus a normalised key), so a class tag can be "Year 10" or "ND2 Computing" and a subject label can be a course name; nothing special is needed. Recommended: the bank works for all three school types with no special case, and the first tests include a `HIGHER_ED` school to prove a course name matches as a subject. Say if higher-ed schools should be excluded in the first release.
- **D3. Settings storage and step-up. DECIDED (maintainer, 2026-10-19): yes, every change needs the fresh re-authentication.** `SchoolSettings` is one typed row per school and every change needs a recent re-authentication (recorded as `stepUpVerifiedAt` in `SettingsChangeAudit`; the helper `proveOwnPassword` in `src/lib/auth/reauth.ts` is the password form of it). The question bank has fifteen keys (sixteen with `bank.parents.view`, D4) with a school value and an optional per-campus narrowing, which does not fit one typed row. Build: a `QuestionBankSetting` table (`tenantId`, nullable `campusId`, `key`, JSON `value`), validated by the same pure resolver as AlEemaan (copied, with its unit tests), audited in `QuestionBankAudit` (not `SettingsChangeAudit`, which has typed columns). **Every change, school-wide or campus, needs the same fresh re-authentication**, so the rule is the one people already know. (AlEemaan has no re-authentication step today, so this is an Octalve-only addition.)
- **D4. Parents. DECIDED (maintainer, 2026-10-23): it is a setting in the school's administration, with the three options as its values.** In AlEemaan a pupil and a guardian act through the SAME portal sign-in, so a guardian already sees the child's practice history there; Octalve gives a `STUDENT` and a `PARENT` separate accounts, so the school chooses what a parent account sees of the bank.
  - **The setting: `bank.parents.view`, one of `NONE`, `SUMMARY`, `FULL`. Default `NONE`** (option A, the recommended and safest start: a parent account reaches nothing of the bank until the school turns it on).
    - `NONE`: a parent sees nothing of the bank.
    - `SUMMARY`: a read-only summary of the child's practice (how many sets, the share correct, the weakest topics); never a question's text. Needs slice 5 (reports) to have anything to show.
    - `FULL`: the child's practice history exactly as the child sees it, PRACTICE questions only and what the child sees after answering, never more. Needs slice 4 (pupil practice).
  - **Fixed, whatever the level:** a parent account never sees a `TEACHERS_ONLY` question (or one still hidden until its date), never an answer key the child has not been shown, and never any question text at `SUMMARY`. Only a parent with an APPROVED guardian link to that child sees anything about that child, and only about that child.
  - **A campus may only narrow** (the rule of every `bank.*` key): the order is `NONE` < `SUMMARY` < `FULL`, a campus can lower the school's level and never raise it, and a campus value above the school's is ignored. The effective level for a child is the one of their campus.
  - **Switches that cap it:** with `bank.access.pupils` off there is no practice, so a parent sees nothing whatever this says. `bank.reports.pupils` is not coupled to it (it is about the pupil's own reports).
  - **Who and how:** like every bank setting (D3), only an `ADMIN` of the school (a `CAMPUS_ADMIN` for a campus's narrowing), every change needs the fresh re-authentication and is written to `QuestionBankAudit` with the old and new value.
  - **In the build:** the key is part of the settings slice (slice 1, which makes sixteen `bank.*` keys instead of fifteen) with its resolver rule `level` (ordered, lower wins) and unit tests; the screens that use it arrive with slice 4 (`FULL`) and slice 5 (`SUMMARY`). Until then the setting exists, defaults to `NONE` and shows a note that it takes effect when practice and reports are available.
  - **AlEemaan (corrected 2026-10-26):** it already has this choice under another name, so no `bank.parents.view` key is being added there. Its portal tells a pupil from a guardian since task 0040 step 1 (PR #93 there), and `portal_access.guardian.practice` carries the same three values (`NONE`, `SUMMARY`, `FULL`), per branch, set by the superadmin and audited. Two differences are deliberate: the guardian default there is `SUMMARY` (the maintainer's table of 2026-10-25; here a parent starts at `NONE`), and there is no school-wide ceiling for a branch to narrow. This is a proposal for the maintainer to confirm: if the same key is wanted in both, AlEemaan's `bank.parents.view` would be added as a ceiling applied with the stricter-of-two rule, and nothing reads either until pupil practice exists there. Details: AlEemaan `docs/tasks/0040-portal-pupil-guardian-separation.md` section 3.
- **D5. Who may assign reviewers.** Recommended as in AlEemaan: a school `ADMIN` assigns any, including reviewers for every campus; a `CAMPUS_ADMIN` assigns only active staff of their own campus.
- **D6. Where images live. DECIDED (maintainer, 2026-10-19): a storage adapter, with Cloudinary, Cloudflare R2 and Amazon S3 as the first backends**, in BOTH projects (neither had an upload or storage layer, and both deploy to Vercel, which has no persistent disk). The full design is in AlEemaan's `docs/tasks/0032-forms-and-question-bank.md` section 4a, which is built first; Octalve copies the adapter. What matters here:
  - One small `ImageStore` interface (`put`, `get`, `remove`, `check`) and NO method that returns a URL. `r2` is the `s3` backend with R2's endpoint and region `auto`; `memory` is for tests and is refused in production. One store per deployment, chosen by `IMAGE_STORE` and that backend's credentials; missing, unknown or incomplete configuration makes the image routes answer 503 and nothing falls back to another store.
  - Each image records which store holds it, so a deployment can move from one backend to another without breaking saved images.
  - **Exam secrecy does not depend on the backend.** The browser is never given a backend URL for a bank image; every image is served through our own route (`.../question-bank/images/[id]`) that runs the same access check as the question (status, visibility, role, campus) and streams with `Cache-Control: private, no-store`. Buckets are private; Cloudinary assets are `authenticated`.
  - The bytes are validated and re-encoded on our server first, so location and camera data are gone whichever backend is used.
  - **Octalve adds the school to every key**: `octalve/<tenantId>/question-bank/<imageId>`, so one school's objects are never mixed with another's, and the route checks the tenant before it asks the store for anything.
  - Tests never call a real service. Real-credential runs against Cloudinary, R2 and S3 are manual and are reported as NOT run until someone supplies credentials.

## 4. What is copied, what is rewritten

- **Copied unchanged** (and its unit tests ported): `normalizeLabel`, the settings parsing and narrowing rules, the exam-secrecy rules, the error wording.
- **Rewritten for tenancy**: the schema (tenantId, composite keys, policies), every service (runs inside `auth.tenant.run`), the routes (tenant `withAuth`, campus-scope helpers), the settings table (D3), the reviewer eligibility check (a `TenantMembership`, not a `Membership`).
- **Octalve only**: the catalog guard entries, the support-view exclusion (section 5), the step-up proof on settings changes.

## 5. Platform administrator and support view

- The platform administrator reads no tenant data (ADR 0016), and the question bank holds the most sensitive rows in the product (unreleased exam questions with their answers).
- A school can grant a platform administrator read-only support access by area (ADR 0017; the areas today are settings, academics, people, attendance, results). A route that declares no `area` is not reachable from a support view at all. **No question bank route declares an area, and a test proves it**: a support session gets a 403 on every question bank route, including a granted `settings` area.
- The audit is the school's own `QuestionBankAudit`; nothing about the bank is copied into the platform's audit log beyond what ADR 0017 already writes for any support request.

## 6. Build order and tests

Same slices as AlEemaan (1 foundation, 2 bank core, 3 use in assessments, 4 pupil practice, 5 reports, 6 practice sets, 7 questionnaires, 8 paper work, 9 manual marking, 10 printing), each with its own migration, tests first where possible, docs in the same change.

Tests Octalve adds to AlEemaan's list, for every slice:
- **Two schools, every route**: school B's administrator, teacher and student get nothing of school A's (a 403 for a school they do not belong to, the same answer as for one that does not exist); the same for a guessed id.
- **Row-level security**: as `app_user` with no tenant set, the question bank tables return no rows; with school B's tenant set, school A's rows are invisible and an insert for A is refused; the catalog guard lists every new table.
- **Campus matrix**: `CAMPUS_ADMIN` of another campus (404), of the same campus (allowed), a school-wide row (403 to change); a general item is visible to every campus of the school but never to another school.
- **Support view**: refused everywhere (section 5).
- **Step-up**: a settings change without a fresh re-authentication is refused and writes nothing; a wrong proof is rate-limited (the existing limiter).
- **Higher-ed school** (D2): a course name matches as a subject.
- Fuzz and hostile input as in AlEemaan (ids with NUL bytes and 5 KB strings are a clean 404, never a 500; strict bodies; seeded random requests). AlEemaan's slice 1 found that a NUL byte in a query id was a 500 in shared route code: Octalve's `[code]` and id handling must be probed the same way when the build starts.
- Axe in both themes, desktop and phone, on every screen.

## 7. Migration notes

Additive migrations, one per slice, applied before the code that needs them (as AlEemaan). The migration lists the new tables for the catalog guard and enables row-level security in the same file as the `CREATE TABLE`, so there is no moment when a table exists without a policy.

## 8. Not decided here

- The exact similarity method for overlap flags and the retirement wording (AlEemaan's section 16).
- Whether partial credit for multiple selection ships in slice 9.
- Whether the existing quiz tables (`Quiz`, `QuizQuestion`, `QuizAttempt` in `lms.prisma`) are later re-pointed at form questions (not now, as in AlEemaan).
