# Octalve Edu — Domain Implementation: Full Step-by-Step Plan

> Companion to `docs/development-history/octalve_edu_progress.md` (what's actually built,
> verified against the real repo) and `docs/development-history/phases/*.md` (one detailed doc
> per completed phase). Mirrors the structure and rigor of `TheNiche`'s own
> `docs/development-history/domain-api-implementation-plan.md`, adapted to Octalve Edu's actual
> domains (school administration, not e-commerce/LMS-as-a-product). Every model and rule below is
> cross-checked against `docs/PRD.md`'s numbered sections and the Security & Compliance Audit tab
> of the same doc — cited inline as `(PRD §N)` or `(Audit #N)` so this plan doesn't drift from the
> documents it's derived from.

## Context

Unlike a from-scratch product with no prior art, Octalve Edu's requirements were stress-tested
twice before any schema was written: once through an ordinary requirements pass (`docs/PRD.md`
§1–§14), and a second time through an adversarial security/compliance audit (the same Claude Doc's
Security & Compliance Audit tab, cross-checked against a second, independently-produced audit).
Several schema decisions below exist *specifically* to close a finding from that audit, not from
the PRD's feature list alone — those are called out explicitly, because they're easy to lose track
of once the code exists and the audit document doesn't.

**What's already real, verified against the actual repo (not assumed):**

1. **Phase 0 is done** — see `docs/development-history/phases/phase-0-foundation.md` for the full
   record. Summary: Next.js 16 (App Router) + TypeScript + Tailwind scaffold, Prisma 6.19 +
   PostgreSQL with Auth.js's required tables plus `Tenant`/`Campus`/`TenantMembership` (the
   verified-membership table the tenant-trust-boundary check reads), a `tier-manifest.json`
   skeleton, and a local-dev `docker-compose.yml`. `pnpm build` is clean, first migration applied
   against a real local Postgres.
2. **No domain schema exists yet.** Every model in Phase 0.5 onward below is new.
3. **No auth wiring, RLS policies, or API routes exist yet**, despite Phase 0's schema already
   having the tables Auth.js needs — the schema existing is not the same as the auth flow being
   built. That's Phase 0.5, sequenced first for exactly this reason.

This document sequences Phase 0.5 onward. Phase 0 is included only as a retrospective pointer, not
as a step to execute.

---

## Phase 0.5 — Auth, RLS & Shared API Infrastructure

Nothing in Phase 1 onward is safe to build on top of until this phase closes the two Critical
findings from the security audit that are architectural, not feature-level: the tenant-trust
boundary and session revocability. Both are infrastructure, not "a school feature," which is why
they're their own phase rather than folded into Phase 1.

### 0.5.0 — First-run superadmin setup wizard (Solo only) — **Done**, built ahead of the rest of
this phase

PRD §4's onboarding table names this for Solo installs ("Run installer, one-time setup wizard") but
never specifies it — built now, out of sequence relative to 0.5.1–0.5.3 below, because it needed
almost none of that infrastructure (no Auth.js session, no tenant-trust-boundary resolver — it's the
one route that runs *before* either exists) and unblocks manually testing everything after it
without a `prisma db seed` script standing in for a real admin account. Adapted from `proplity`'s
own first-run-setup-wizard implementation (`docs/development-history/phases/first-run-setup-wizard.md`
in that repo), which solves the identical problem — a fresh production database has no admin user —
for a single-tenant app; the adaptation here is entirely about Octalve Edu having a `Tenant` model
that `proplity` doesn't.

- **Solo-only, not a SaaS concept.** SaaS tenants get their own self-serve signup flow later (not
  built yet); this wizard bootstraps the *one* tenant a Solo install ever has. `GET`/`POST
  /api/v1/setup` and the `/setup` page both hard-404 outside `DEPLOYMENT_MODE=solo` — not just a
  UI-level redirect, since the route doing anything at all in SaaS mode would be a bug, not a choice.
- **Schema** (retrofit into Phase 0's `schema.prisma`, this migration
  `20260927223904_add_setup_wizard`): `User.passwordHash String?` (the same field 0.5.1 below
  already planned to add — done here instead since this route needed it first); a `SystemSettings`
  singleton (`id = "global"`, `setupComplete Boolean`) — proplity's exact pattern, since Octalve
  Edu's own `Tenant` table can't answer "is setup done" by itself without a race (two concurrent
  requests both seeing zero tenants); `AuditLog` brought forward from Phase 1's design (§1.5 below)
  because this wizard needed a real audit trail same as everything after it will.
- **API** (`src/app/api/v1/setup/route.ts`): `GET` returns `{ setupComplete, requiresToken }`;
  `POST` guarded by CSRF (`lib/auth/csrf.ts`), IP rate limiting (`lib/auth/rate-limit.ts` —
  in-memory, deliberately not the real `LoginAttempt`-backed limiter 0.5.1 will build for login,
  since Solo always runs as one long-lived process, never serverless), Zod validation, an optional
  `SETUP_TOKEN` compared with `crypto.timingSafeEqual`, and the same atomic-conditional-update
  transaction as `proplity` (`systemSettings.updateMany({ where: { setupComplete: false }, ... })` —
  `count === 0` means someone else's request already won the race). On success, creates the `Tenant`
  (code auto-derived from the school name via `lib/tenant/validate-code.ts`'s slugify + reserved-word
  check — Solo installs never see or choose a code, per PRD §7), the admin `User`, its
  `TenantMembership` (`role: ADMIN`), and an `AuditLog` row, all in one transaction. Every response
  uses PRD §7's mandatory `{ data, meta, error }` envelope (`lib/api/envelope.ts`) — the first route
  in the repo to need it, so that's where the shared helper was born.
- **Frontend** (`src/app/setup/`): `page.tsx` is a Server Component, 404s outside Solo, redirects to
  `/login` if `setupComplete` is already true (fails open on a DB error, same reasoning as
  `proplity`'s version — a transient blip shouldn't lock a deployer out of their own bootstrap
  step), otherwise renders `SetupWizardForm.tsx` (school name, admin name/email, password ×2 with a
  live checklist, optional setup-token field). No design-system dependency added for this — Octalve
  Edu has no component library yet, so it's plain Tailwind, not a port of `proplity`'s (which uses
  `lucide-react` icons and `sonner` toasts it already had installed).
- **Verified live, not just built**: `pnpm prisma migrate dev` applied against the real local
  Postgres; `pnpm build` clean; `DEPLOYMENT_MODE=solo pnpm dev` + a real `POST` created a tenant +
  admin + membership + audit row (confirmed via the response body), a second `POST` correctly got
  `409 ALREADY_COMPLETE`, and `GET` reflected `setupComplete: true` afterward; separately,
  `DEPLOYMENT_MODE=saas pnpm dev` confirmed both `/api/v1/setup` and `/setup` return `404`. Test data
  truncated from the local dev database afterward so it starts clean again.
- **Explicitly out of scope**: no email to the new admin (no delivery provider wired up yet, same
  gap `proplity` documents); no Campus/branch creation in the wizard (a Solo school can add
  campuses later via Settings, once that exists); a SaaS-side "platform operator" superadmin concept
  is not built and not requested — this is only ever a single school's first admin.

### 0.5.1 — Auth.js wiring

> **Heads-up before this step gets built (2026-09-28):** the two bullets immediately below — a
> `Credentials` provider *combined with* `session.strategy: "database"` — are not compatible in
> Auth.js v5. AlEemaan (sibling project, identical stack) hit this live: `UnsupportedStrategy:
> Signing in with credentials only supported if JWT strategy is enabled`, thrown by Auth.js's own
> `assertConfig` on every request under `/api/auth/*`, not just sign-in. It's a hard constraint in
> Auth.js itself. AlEemaan's fix (full record in its own `domain-implementation-plan.md` §0.5.1.1,
> keeping database sessions since that's the deliberate PRD §7 decision here too): drop the
> `Credentials` provider entirely (`providers: []`), and hand-roll login/logout as plain API routes
> that write/delete rows in the same `Session` table Auth.js's `PrismaAdapter` reads, with an
> explicit `cookies.sessionToken.name` so both sides agree on the cookie. Expect to do the same
> here rather than wiring the two bullets below as literally written — confirm against the installed
> `next-auth` version first in case a later release changes this, but don't assume it's fixed.

- Credentials provider (email + password) against `User.email`, backed by a `passwordHash` column
  — the field already exists (`User.passwordHash String?`, added by §0.5.0's migration since the
  setup wizard needed it first); this step is just wiring Auth.js's credentials provider to read it.
- **Database session strategy, not JWT** (PRD §7 stack table decision) — Auth.js's Prisma adapter
  already has the `Session` table from Phase 0; configure `session.strategy = "database"`
  explicitly, since Auth.js v5 defaults to JWT and this is easy to leave on the wrong default
  silently.
- `otplib`-based TOTP for MFA. Retrofit into `User`: `mfaSecret String?` (encrypted at rest —
  PRD §10), `mfaEnabled Boolean @default(false)`. `SchoolSettings.mfaRequiredForTeaching` (Phase 1)
  is what makes MFA mandatory for a given role rather than optional; Phase 0.5 only builds the
  mechanism.
- Session revocation surface: a "your active devices" page reading `Session` rows for the current
  user, with a delete action per row (Audit #23's server-revocable-sessions fix) — trivial to build
  now specifically *because* database sessions were chosen over JWT in Phase 0.

### 0.5.2 — Tenant trust boundary (closes Audit's most severe finding)

This is PRD §7's own words, made real:

```
authenticated user → verified tenant membership → SET LOCAL app.tenant_id → RLS
```

- `lib/tenant/resolve-tenant.ts`: given a request and its authenticated session, reads the URL's
  `[code]` segment **only as a lookup key** — resolves it to a `Tenant.id`, then queries
  `TenantMembership` for `(userId, tenantId)`. No membership row → 403, regardless of what the URL
  says. This function's own test suite is the negative-test requirement from Audit #21: change
  `[code]` to a different tenant's code and confirm every protected route rejects it, not just a
  sample.
- `lib/tenant/for-tenant.ts`: the `forTenant(tenantId)` Prisma client extension already named in
  PRD §7, implemented exactly as the `ims` project's proven version — wraps every query in a
  transaction that runs `SET LOCAL app.tenant_id = '<verified id>'` first. The `tenantId` passed in
  must always be the one `resolve-tenant.ts` verified, never a value read directly off `req.url` or
  `req.params` anywhere else in the codebase — enforced by making `forTenant()` only importable
  from route handlers that have already called `resolveTenant()`, not by convention alone (an
  ESLint rule restricting the import, mirroring the tier-boundary lint pattern from Phase 0).
- RLS policies added in this phase's migration for every tenant-scoped table that exists so far
  (currently: `Campus`, `TenantMembership`). Every table added in Phase 1 onward gets its RLS
  policy in the *same* migration that creates the table — never a follow-up migration, so there's
  no window where a new table exists without RLS.
- `DEPLOYMENT_MODE=solo` short-circuit: `resolve-tenant.ts` returns the install's single `Tenant`
  row directly, skipping the membership lookup (there's nothing to disambiguate) — but still calls
  `forTenant()` with that tenant's real ID, so Solo and SaaS share the exact same downstream code
  path and RLS policies stay meaningful even under Solo (PRD §7's "same schema, same code paths").
- Front-door routing (PRD §7 "URL scheme"): `/dashboard`, `/list/*` resolve the session's active
  tenant and redirect into `/schools/[code]/...` when the user belongs to exactly one tenant; a
  school picker otherwise. Built here because it depends on 0.5.2's membership lookup existing
  first.

### 0.5.3 — Shared API infrastructure

Per PRD §7's API-conventions paragraph, built once and reused by every route from Phase 1 onward:

- `lib/api/envelope.ts` — `{ data, meta, error }` response shape, one helper, never constructed
  inline per route.
- `lib/api/pagination.ts` — both offset (`page`/`limit`) and cursor helpers (PRD §7: offset for
  small stable lists, cursor for high-churn ones like `AttendanceRecord`/`AuditLog`).
- `lib/api/validate.ts` — wraps a Zod schema around a route handler; the same schema instance is
  later fed to `zod-openapi` (PRD §7 stack table) for the generated API docs, so validation and
  documentation cannot drift apart.
- `lib/api/rate-limit.ts` — `@upstash/ratelimit`-backed (or a Redis token-bucket, per the stack
  table), applied via middleware to auth, result-lookup, and payment route groups specifically —
  closes Audit finding #14.
- `withAuth(handler, { roles })` — checks the resolved tenant membership's `role` against an
  allow-list, `.some()`-style if a user can ever hold more than one role in the future (not true
  today per PRD §7's Role enum, but this guards against the same class of bug TheNiche's own
  migration plan flagged: don't write `.includes()` against a value that might become an array
  later without noticing).

**Verification for this phase, before Phase 1 starts:** a negative-test file exercising every item
above — wrong tenant in the URL, no membership, session revoked mid-request, malformed pagination
params, rate limit exceeded — passes in CI. This is the one phase where "the code compiles" is not
sufficient evidence of done; per Audit finding #21, RLS-looking-correct and RLS-being-correct are
different claims until a real cross-tenant test fails when it should.

---

## Phase 1 — MVP: Core SIS + Finance

Matches PRD §5/§6's MVP scope exactly. Two new schema files, `prisma/schema/sis.prisma` and
`prisma/schema/finance.prisma` (multi-file schema mode, same convention `ims` uses).

### 1.1 — Retrofit into Phase 0's `Tenant`

```prisma
enum SchoolType {
  K12
  HIGHER_ED
  VOCATIONAL
}
```

Add `schoolType SchoolType` to `Tenant` — decides whether `AcademicPeriod` below means "term"
(K12), "semester" (HIGHER_ED), or "cohort with no fixed calendar" (VOCATIONAL), per PRD §3's
decision to support all three school types from day one.

### 1.2 — `sis.prisma`

**`AcademicSession` / `AcademicPeriod` — two levels, not one flat "Term" table.**

```prisma
model AcademicSession {
  id        String   @id @default(cuid())
  tenantId  String
  label     String            // "2026/2027"
  startDate DateTime
  endDate   DateTime
  isCurrent Boolean  @default(false)

  tenant Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  terms  AcademicPeriod[]

  @@index([tenantId])
}

enum PeriodKind {
  TERM      // K12: 1st/2nd/3rd term
  SEMESTER  // HIGHER_ED
  COHORT    // VOCATIONAL: a running cohort, no fixed term boundary
}

model AcademicPeriod {
  id        String     @id @default(cuid())
  tenantId  String
  sessionId String
  kind      PeriodKind
  label     String     // "1st Term", "Semester 1", "Cohort — Jan 2027 Intake"
  startDate DateTime
  endDate   DateTime?  // nullable for COHORT — no fixed end at creation
  isCurrent Boolean    @default(false)

  tenant  Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  session AcademicSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([sessionId])
}
```

**Why two levels (Decision, PRD §14):** the billing-cycle setting (per-term vs. per-session) has to
bill against *either* a whole session or one period — `Invoice.periodId` needs a foreign key that's
meaningful at both grains, which a single flat table can't give without picking one grain up front
and being wrong for the other setting value.

**`ClassGroup` / `ClassArm` — capacity lives on the arm, not the group.**

```prisma
model ClassGroup {
  id       String @id @default(cuid())
  tenantId String
  campusId String?
  name     String  // "JSS1", "Year 10", "Cohort A"

  tenant Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  campus Campus?    @relation(fields: [campusId], references: [id], onDelete: SetNull)
  arms   ClassArm[]

  @@index([tenantId])
}

model ClassArm {
  id           String @id @default(cuid())
  classGroupId String
  name         String // "A", "B"
  capacity     Int?   // null = uncapped

  classGroup  ClassGroup          @relation(fields: [classGroupId], references: [id], onDelete: Cascade)
  enrollments StudentEnrollment[]

  @@index([classGroupId])
}
```

**Why (Decision, PRD §5/§14 "class capacity/streaming — manual for MVP, Settings-ready"):**
"JSS1 is full" isn't a real statement — "JSS1-A is full" is. Putting `capacity` on the arm now
means the future auto-assign-on-capacity feature needs zero schema migration when it ships; MVP
just never reads the field for automation, only for display.

**`Subject`, `StaffRecord`, `StaffSubjectAssignment` — staff record ≠ staff account.**

```prisma
enum StaffCategory {
  TEACHING
  NON_TEACHING
}

model Subject {
  id       String @id @default(cuid())
  tenantId String
  name     String
  code     String?

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
}

model StaffRecord {
  id        String        @id @default(cuid())
  tenantId  String
  campusId  String?
  userId    String?       @unique  // nullable — a record does not require an account (PRD §5/§7)
  category  StaffCategory
  firstName String
  lastName  String
  phone     String?
  email     String?
  isActive  Boolean       @default(true)

  tenant Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  campus Campus? @relation(fields: [campusId], references: [id], onDelete: SetNull)
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)

  subjectAssignments StaffSubjectAssignment[]

  @@index([tenantId])
}

model StaffSubjectAssignment {
  id            String @id @default(cuid())
  staffRecordId String
  subjectId     String
  classArmId    String

  staffRecord StaffRecord @relation(fields: [staffRecordId], references: [id], onDelete: Cascade)
  subject     Subject     @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  classArm    ClassArm    @relation(fields: [classArmId], references: [id], onDelete: Cascade)

  @@unique([staffRecordId, subjectId, classArmId])
}
```

**Why `userId` is nullable *and* `@unique` (Decision, PRD §5/§7):** this is the field that makes
"staff records vs. staff accounts" a real constraint, not just prose — a security guard gets a
`StaffRecord` with `userId: null` forever; a teacher gets one, then an admin action sets `userId`
once (never twice, hence `@unique`) when an account is provisioned.

**`StudentRecord` — no NIN/BVN field, ever, without a named exception.**

```prisma
model StudentRecord {
  id          String  @id @default(cuid())
  tenantId    String
  campusId    String?
  userId      String? @unique
  firstName   String
  lastName    String
  dateOfBirth DateTime
  admissionNo String   // school-assigned, human-facing — never used as a URL/lookup key
  isActive    Boolean  @default(true)

  tenant Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  campus Campus? @relation(fields: [campusId], references: [id], onDelete: SetNull)
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)

  enrollments   StudentEnrollment[]
  guardianLinks GuardianLink[]
  attendance    AttendanceRecord[]
  results       Result[]
  invoices      Invoice[]

  @@unique([tenantId, admissionNo])
  @@index([tenantId])
}
```

**Why no national-ID field (Decision, PRD §9, closes Audit #3/#7):** data minimization isn't a
policy statement if the schema has a `nin` column sitting there "just in case." There isn't one.
`admissionNo` is unique per tenant only (not globally), and every lookup route resolves a student
through the authenticated/authorized path (Phase 0.5), never through `admissionNo` in a URL —
closes Audit #27 (predictable export/lookup URLs) at the data-access-pattern level, not just the
URL-signing level.

**`StudentEnrollment` — the year-end-rollover model.**

```prisma
enum EnrollmentStatus {
  ACTIVE
  PROMOTED
  REPEATED
  WITHDRAWN
  TRANSFERRED
  ALUMNI
}

model StudentEnrollment {
  id         String           @id @default(cuid())
  studentId  String
  classArmId String
  periodId   String
  status     EnrollmentStatus @default(ACTIVE)

  student  StudentRecord @relation(fields: [studentId], references: [id], onDelete: Cascade)
  classArm ClassArm      @relation(fields: [classArmId], references: [id], onDelete: Cascade)

  @@unique([studentId, periodId])
}
```

**Why this is *the* rollover implementation (Decision, PRD §5/§6):** rollover is "close the current
`ACTIVE` enrollment with an outcome status, create a new row in the next period" — one function,
called either by a scheduled job (`SchoolSettings.rolloverMode = AUTOMATIC`) or an admin
click-through (`ADMIN_CONFIRMED`). The setting changes *which code path calls the function*, never
the data model — this is what "the state machine isn't optional, only whether it's automatic is"
(PRD §5) means concretely.

**`GuardianLink` — the fix for the audit's most-cited AuthZ finding.**

```prisma
enum GuardianLinkStatus {
  PENDING
  APPROVED
  REVOKED
}

model GuardianLink {
  id               String             @id @default(cuid())
  studentId        String
  guardianUserId   String
  status           GuardianLinkStatus @default(PENDING)
  approvedByUserId String?
  linkingCodeUsed  String?
  createdAt        DateTime           @default(now())

  student      StudentRecord @relation(fields: [studentId], references: [id], onDelete: Cascade)
  guardianUser User          @relation("GuardianOf", fields: [guardianUserId], references: [id], onDelete: Cascade)

  @@unique([studentId, guardianUserId])
  @@index([studentId])
}
```

**Why (closes Audit #12/#15, SEC-001/SEC-005 directly):** application code can only ever `INSERT` a
`GuardianLink` as `PENDING` from a self-service request — no code path lets a parent create their
own `APPROVED` row. A separate admin action or one-time linking-code redemption is the *only* way
`status` becomes `APPROVED`. Every parent-facing query joins through
`GuardianLink WHERE status = 'APPROVED'`, never a bare `studentId` lookup — this is what makes
Abuse Case 1 from the audit (self-link by guessing an admission number) actually impossible rather
than just discouraged.

**`AttendanceRecord` — carries the offline-sync provenance flag.**

```prisma
enum AttendanceStatus {
  PRESENT
  ABSENT
  LATE
  EXCUSED
}

enum AttendanceSource {
  ONLINE
  OFFLINE_SYNC
}

model AttendanceRecord {
  id              String   @id @default(cuid())
  studentId       String
  classArmId      String
  date            DateTime @db.Date
  status          AttendanceStatus
  markedByStaffId String
  markedAt        DateTime @default(now())
  source          AttendanceSource @default(ONLINE)

  student StudentRecord @relation(fields: [studentId], references: [id], onDelete: Cascade)

  @@unique([studentId, classArmId, date])
  @@index([classArmId, date])
}
```

**Why `source` exists (closes Audit #8, Abuse Case 2):** an `OFFLINE_SYNC` row is one that arrived
through the sync endpoint, not a live request — lets the audit trail and any anomaly detection
distinguish "marked live" from "marked offline, synced later" without a second table. The sync
endpoint itself re-runs the exact same authorization + business-rule checks as the online path
(same `withAuth`/`forTenant()` machinery from Phase 0.5) — there is no separate, weaker "offline
write" code path for an attacker to find.

**`Result` / `ResultAudit` — the state machine from PRD §5, made real.**

```prisma
enum ResultStatus {
  DRAFT
  SUBMITTED
  APPROVED
  PUBLISHED
  LOCKED
}

model Result {
  id                String       @id @default(cuid())
  studentId         String
  subjectId         String
  periodId          String
  score             Decimal
  maxScore          Decimal      @default(100)
  status            ResultStatus @default(DRAFT)
  enteredByStaffId  String
  approvedByStaffId String?
  publishedAt       DateTime?
  lockedAt          DateTime?

  student StudentRecord @relation(fields: [studentId], references: [id], onDelete: Cascade)
  subject Subject       @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  history ResultAudit[]

  @@unique([studentId, subjectId, periodId])
  @@index([periodId])
}

model ResultAudit {
  id          String        @id @default(cuid())
  resultId    String
  actorUserId String
  fromStatus  ResultStatus
  toStatus    ResultStatus
  fromScore   Decimal?
  toScore     Decimal?
  reason      String?
  createdAt   DateTime      @default(now())

  result Result @relation(fields: [resultId], references: [id], onDelete: Cascade)

  @@index([resultId])
}
```

**Why (closes Audit #11, SEC-003):** every status transition writes a `ResultAudit` row in the same
transaction as the `Result.status` change. `reason` is enforced as non-null at the application
layer for any transition originating from `LOCKED` — the DB column stays nullable (a
`DRAFT → SUBMITTED` transition genuinely has no "reason") but the API route for a post-lock
correction rejects a missing reason before it ever reaches Prisma.

**`TimetableSlot`, `Announcement` — straightforward, no audit-driven decisions.**

```prisma
model TimetableSlot {
  id            String @id @default(cuid())
  classArmId    String
  subjectId     String
  staffRecordId String
  dayOfWeek     Int    // 0–6
  startTime     String // "08:00" — a recurring weekly pattern, not a dated event, hence not DateTime
  endTime       String

  classArm ClassArm @relation(fields: [classArmId], references: [id], onDelete: Cascade)
  subject  Subject  @relation(fields: [subjectId], references: [id], onDelete: Cascade)

  @@index([classArmId])
}

model Announcement {
  id              String   @id @default(cuid())
  tenantId        String
  classArmId      String?  // null = school-wide
  title           String
  body            String
  createdByUserId String
  createdAt       DateTime @default(now())

  tenant   Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  classArm ClassArm? @relation(fields: [classArmId], references: [id], onDelete: SetNull)

  @@index([tenantId])
}
```

### 1.3 — `SchoolSettings` (PRD §14) and its step-up-auth audit trail

```prisma
enum BillingCycle          { PER_TERM  PER_SESSION }
enum RolloverMode          { AUTOMATIC  ADMIN_CONFIRMED }
enum DiscountWorkflowMode  { MANUAL_OVERRIDE  APPROVAL_REQUIRED }
enum FeeCostBearer         { SCHOOL_ABSORBS  PASSED_TO_PARENT }

model SchoolSettings {
  tenantId               String              @id  // one row per tenant, by construction
  resultApprovalRequired Boolean              @default(true)  // secure default
  rolloverMode           RolloverMode         @default(ADMIN_CONFIRMED)
  classAutoAssignment    Boolean              @default(false) // MVP: always false; field exists for later
  billingCycle           BillingCycle         @default(PER_TERM)
  feeReminderEnabled     Boolean              @default(true)
  discountWorkflowMode   DiscountWorkflowMode @default(MANUAL_OVERRIDE)
  feeCostBearer          FeeCostBearer        @default(SCHOOL_ABSORBS)
  multiCampusEnabled     Boolean              @default(false)
  mfaRequiredForTeaching Boolean              @default(true)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

model SettingsChangeAudit {
  id               String   @id @default(cuid())
  tenantId         String
  actorUserId      String
  field            String
  fromValue        String
  toValue          String
  stepUpVerifiedAt DateTime // MFA re-confirmation timestamp for THIS change — PRD §7/§14
  createdAt        DateTime @default(now())

  @@index([tenantId])
}
```

**Why `tenantId` is the primary key, not a separate `id` (Decision):** exactly one settings row
exists per school by definition — making the tenant FK the PK rules out ever accidentally creating
two, rather than relying on a `@unique` constraint someone could theoretically bypass with raw SQL.

**Why `SettingsChangeAudit` is separate from the general `AuditLog` (below), not a variant of it
(Decision, closes Audit #22):** every settings change specifically requires `stepUpVerifiedAt` to
be non-null — a column-level guarantee a generic polymorphic audit table can't enforce. The API
route for changing any `SchoolSettings` field is the only place allowed to write to this table, and
it does so *before* applying the actual settings change, not after — a step-up check that fails
never lets the underlying toggle flip.

### 1.4 — `finance.prisma`

```prisma
model FeeStructure {
  id           String  @id @default(cuid())
  tenantId     String
  periodId     String
  classGroupId String? // null = applies to all classes
  name         String  // "Tuition", "Sports Levy"
  amount       Decimal

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
}

enum InvoiceStatus { UNPAID  PARTIALLY_PAID  PAID  WAIVED }

model Invoice {
  id          String        @id @default(cuid())
  tenantId    String
  studentId   String
  periodId    String
  totalAmount Decimal
  amountPaid  Decimal       @default(0)
  status      InvoiceStatus @default(UNPAID)
  createdAt   DateTime      @default(now())

  student   StudentRecord     @relation(fields: [studentId], references: [id], onDelete: Cascade)
  payments  Payment[]
  discounts InvoiceDiscount[]

  @@index([studentId])
  @@index([tenantId, status])
}

enum PaymentProvider { PAYSTACK  FLUTTERWAVE }
enum PaymentStatus   { PENDING  SUCCESS  FAILED }

model Payment {
  id                 String          @id @default(cuid())
  invoiceId          String
  amount             Decimal
  provider           PaymentProvider
  providerRef        String          // the idempotency key
  status             PaymentStatus   @default(PENDING)
  verifiedServerSide Boolean         @default(false)
  createdAt          DateTime        @default(now())

  invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  @@unique([provider, providerRef])
  @@index([invoiceId])
}

model InvoiceDiscount {
  id               String               @id @default(cuid())
  invoiceId        String
  amount           Decimal
  reason           String
  mode             DiscountWorkflowMode
  appliedByUserId  String
  approvedByUserId String?
  createdAt        DateTime             @default(now())

  invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
}

model PaymentWebhookEvent {
  id             String          @id @default(cuid())
  provider       PaymentProvider
  eventId        String
  signatureValid Boolean
  processedAt    DateTime?
  rawPayloadHash String          // a hash, never the raw payload — PII/secret-in-logs discipline
  receivedAt     DateTime        @default(now())

  @@unique([provider, eventId])
}
```

**Why `Payment.verifiedServerSide` plus `@@unique([provider, providerRef])` together (Decision,
closes Audit #17 and #24 — the two Critical payment findings):** a webhook handler may `INSERT` a
`Payment` row the instant its signature checks out, but the code path that flips `Invoice.status`
to `PAID` is gated on `verifiedServerSide = true`, set only after a *separate*, independent
server-to-server call to the provider's transaction-verification API confirms amount, currency, and
reference all match the invoice. A forged webhook can create an unverified, `PENDING` `Payment`
row — it cannot make an invoice show as paid. The unique constraint on `(provider, providerRef)` is
enforced at the database level, so a replayed webhook physically cannot insert a second row, not
just "shouldn't."

**Why `PaymentWebhookEvent` is a second table, separate from `Payment` (Decision):** `Payment`
records a payment attempt; `PaymentWebhookEvent` records that a webhook call happened at all,
including invalid-signature attempts, which have no associated `Payment` row and would otherwise
leave no trace — closing the "rejected/invalid webhook attempts are logged and alertable" half of
the security-audit fix, not just the "valid ones are verified" half.

### 1.5 — Cross-cutting: `AuditLog`

```prisma
model AuditLog {
  id            String   @id @default(cuid())
  tenantId      String
  actorUserId   String
  action        String   // "result.approve", "invoice.discount.apply", "settings.change"
  targetType    String
  targetId      String
  beforeValue   Json?
  afterValue    Json?
  reason        String?
  correlationId String?
  createdAt     DateTime @default(now())

  @@index([tenantId, targetType, targetId])
  @@index([tenantId, createdAt])
}
```

**Migration-level enforcement, not just convention (closes Audit #19/#31):** the Phase 1 migration
`REVOKE UPDATE, DELETE ON "AuditLog", "ResultAudit", "SettingsChangeAudit" FROM <app role>` after
creating the tables — application code can only ever `INSERT` into any of the three audit tables,
enforced by Postgres itself, not by "we don't call `.update()` on these in the code."

### 1.6 — Build order within Phase 1

1. Migration: all models above + RLS policies + the audit-table `REVOKE`, in one migration.
2. `SchoolSettings` row auto-created (all defaults) whenever a `Tenant` is created — never a
   nullable "settings not configured yet" state.
3. API routes, in dependency order: `AcademicSession`/`Period` → `ClassGroup`/`Arm`/`Subject` →
   `StaffRecord` → `StudentRecord` + `GuardianLink` → `StudentEnrollment` → `AttendanceRecord` →
   `Result` (+ approval-workflow endpoints) → `FeeStructure`/`Invoice` → `Payment` + webhook
   handlers → `Announcement`/`TimetableSlot`.
4. Admin UI screens in the same order, reusing `DashboardShell`-style layout per role (Admin,
   Teaching Staff, Non-Teaching Staff, Student, Parent — PRD §3/§7).
5. Settings UI: one screen, all toggles from §1.3's table, each write going through the step-up-MFA
   flow from Phase 0.5.

**Verification gate before Phase 1 is "done" (not just "code exists"):** the cross-tenant/IDOR
negative-test suite from Phase 0.5 extended to cover every new route; a live end-to-end walk of
enroll → mark attendance → enter result → approve → publish → parent views it; a live Paystack/
Flutterwave sandbox payment, including a deliberately forged webhook attempt that must fail.

### 1.7 — Lightweight permissions (shared design with AlEemaan)

A deliberately small addition on top of Phase 0's `Role` enum, not a full RBAC engine — scoped down
specifically so MVP doesn't grow a custom-role builder or a per-resource ACL matrix it doesn't need
yet. Same design ships in the AlEemaan PRD's §4 (Users, Roles & Lightweight Permissions), so both
projects stay in sync rather than drifting into two different permission models.

```prisma
enum Permission {
  CAN_APPROVE_RESULTS
  CAN_MANAGE_FINANCE
  CAN_PUBLISH_CONTENT
  CAN_MANAGE_USERS
}

model TenantMembership {
  // ...existing fields from Phase 0 (userId, tenantId, campusId?, role)
  permissions Permission[] @default([])
}
```

- `ADMIN` implicitly has every `Permission` — the enum only exists so a *non-admin* membership can
  be granted one extra capability (a bursar who's `NON_TEACHING_STAFF` getting
  `CAN_MANAGE_FINANCE`; a senior teacher getting `CAN_APPROVE_RESULTS` without being made `ADMIN`),
  closing the gap where the only way to do more than your base role today is to become an admin.
- `withAuth(handler, { roles, permissions })` (§0.5.3's auth helper) checks `role` OR an entry in
  `permissions` — a route can require either, not both, unless it explicitly asks for both.
- **Explicit non-goals, so this doesn't become full RBAC by accretion:** no UI for a school to
  invent new permissions, no per-resource/per-record ACLs, no permission inheritance hierarchy, no
  custom roles. If a school needs more granularity than these four permissions later, that's a
  deliberate future phase, not a Phase 1 scope-creep.

---

## Phase 2 — Communication

Matches PRD §6 Phase 2. New schema file `prisma/schema/comms.prisma`.

```prisma
enum NotificationChannel  { SMS  WHATSAPP  EMAIL  IN_APP }
enum NotificationCategory { TRANSACTIONAL  EDUCATIONAL_ADMIN  MARKETING }  // NCC classification, PRD §9
enum NotificationStatus   { QUEUED  SENT  FAILED }

model NotificationTemplate {
  id           String                @id @default(cuid())
  tenantId     String
  key          String                // "fee_reminder", "result_published"
  channel      NotificationChannel
  category     NotificationCategory
  bodyTemplate String

  @@unique([tenantId, key, channel])
}

model NotificationLog {
  id                String              @id @default(cuid())
  tenantId          String
  recipientUserId   String?
  channel           NotificationChannel
  category          NotificationCategory
  templateKey       String
  status            NotificationStatus  @default(QUEUED)
  providerMessageId String?
  sentAt            DateTime?
  createdAt         DateTime            @default(now())

  @@index([tenantId, createdAt])
}

model StaffParentMessage {
  id              String   @id @default(cuid())
  tenantId        String
  senderUserId    String
  recipientUserId String
  body            String
  createdAt       DateTime @default(now())

  @@index([tenantId, recipientUserId])
}
```

**Why templates are DB rows, not hardcoded strings (Decision, closes Audit #9/#23):** every
outbound message is rendered from a `NotificationTemplate` row, never a string literal in
application code. A CI check (added in this phase) parses every `SMS`/`WHATSAPP` template tagged
`TRANSACTIONAL` and fails the build if its `bodyTemplate` contains a `{{score}}`, `{{amount}}`, or
similar sensitive placeholder — this is what makes "no grades/fee amounts in SMS body" (PRD §5/§14,
Audit #9) a build-time guarantee instead of a code-review hope. Delivery itself runs through
BullMQ jobs (PRD §7 stack table), reading these rows.

Fee reminders (already in Phase 1's `SchoolSettings.feeReminderEnabled`) get their first real
channel here — Phase 1 shipped the setting and the scheduling hook; Phase 2 is what actually sends
anything.

---

## Phase 3 — LMS

Matches PRD §6 Phase 3. New schema file `prisma/schema/lms.prisma`.

```prisma
enum FileScanStatus { PENDING  CLEAN  INFECTED  SCAN_FAILED }

model Assignment {
  id           String   @id @default(cuid())
  classArmId   String
  subjectId    String
  title        String
  instructions String
  dueAt        DateTime
  createdByStaffId String

  submissions AssignmentSubmission[]
}

model AssignmentSubmission {
  id             String         @id @default(cuid())
  assignmentId   String
  studentId      String
  fileUrl        String?        // S3/MinIO object key — never a raw filesystem path (PRD §7)
  fileMime       String?
  fileScanStatus FileScanStatus @default(PENDING)
  textResponse   String?
  submittedAt    DateTime       @default(now())
  score          Decimal?
  feedback       String?

  @@unique([assignmentId, studentId])
}

model LearningMaterial {
  id                String         @id @default(cuid())
  classArmId        String
  subjectId         String
  title             String
  fileUrl           String
  fileMime          String
  fileScanStatus    FileScanStatus @default(PENDING)
  uploadedByStaffId String
}

model Quiz {
  id        String @id @default(cuid())
  subjectId String
  title     String

  questions QuizQuestion[]
}

model QuizQuestion {
  id              String @id @default(cuid())
  quizId          String
  prompt          String
  options         Json   // [{ id, text }]
  correctOptionId String

  quiz Quiz @relation(fields: [quizId], references: [id], onDelete: Cascade)
}

model QuizAttempt {
  id          String    @id @default(cuid())
  quizId      String
  studentId   String
  answers     Json
  score       Decimal
  startedAt   DateTime  @default(now())
  submittedAt DateTime?
}
```

**Why `fileScanStatus` defaults to `PENDING` and gates the download link (Decision, closes Audit
#15/#26):** the literal enforcement point for the file-upload security finding — the application
never returns a usable `fileUrl` to anyone but the uploader until `fileScanStatus = 'CLEAN'`,
checked via ClamAV (PRD §7 stack table) in a BullMQ job triggered on upload. Extensions/MIME types
are allowlisted at the upload route before the file ever reaches storage, not just scanned after.

---

## Phase 4 — Operations

Matches PRD §6 Phase 4. Deliberately thin here — PRD §6 itself calls this "lower urgency for
typical private school pilot," so inventing exact payroll tax logic or NEMIS field mappings now
would be designing against requirements nobody has validated yet, the same reasoning `TheNiche`'s
own plan applies to its own lower-certainty phases. Full design happens when this phase is actually
scheduled against a real customer need.

```prisma
model StaffLeaveRequest {
  id            String   @id @default(cuid())
  staffRecordId String
  startDate     DateTime
  endDate       DateTime
  status        String   // approved/pending/rejected — enum deferred until the approval chain is designed
  approvedByUserId String?
}

model PayrollRun {
  id       String @id @default(cuid())
  tenantId String
  periodId String
  status   String // deliberately a string, not an enum, until tax/pension rules are scoped
}

model LibraryItem {
  id              String @id @default(cuid())
  tenantId        String
  title           String
  isbn            String?
  copiesTotal     Int
  copiesAvailable Int
}

model LibraryLoan {
  id         String    @id @default(cuid())
  itemId     String
  studentId  String
  borrowedAt DateTime  @default(now())
  dueAt      DateTime
  returnedAt DateTime?
}

model TransportRoute {
  id       String @id @default(cuid())
  tenantId String
  name     String
}

model TransportAssignment {
  id        String @id @default(cuid())
  routeId   String
  studentId String
}

model InventoryItem {
  id             String @id @default(cuid())
  tenantId       String
  name           String
  quantityOnHand Int
}

model NemisExportBatch {
  id          String    @id @default(cuid())
  tenantId    String
  periodId    String
  status      String
  submittedAt DateTime?
}
```

`NemisExportBatch` exists as a placeholder table, not a working exporter — PRD §13's competitive
note that EDVES already offers NEMIS reporting means this is worth reserving schema space for, but
PRD §6 explicitly keeps it off the roadmap "until requested," so no export logic is built here.

---

## Phase 5 — Expansion

Matches PRD §6 Phase 5, which the PRD itself frames as conditional ("depends on which market
segment gains traction first") — matching that uncertainty here rather than over-specifying:

- **Native mobile:** no new backend schema — the same versioned REST API (Phase 0.5) is consumed
  by a React Native/Expo client. Nothing to design until this phase starts.
- **Higher-ed course registration/credit units:** extends `AcademicPeriod`/`StudentEnrollment`
  with a `Course` model carrying `creditUnits`, and a registration step distinct from
  `ClassArm`-based K12 placement.
- **Vocational certifications:** a `Certificate` model tied to cohort (`AcademicPeriod{kind:
  COHORT}`) completion.
- **White-labeling/custom domains:** a `CustomDomain` model mapping a domain string to a
  `tenantId`, resolved in the *same* middleware tenant-trust-boundary layer built in Phase 0.5 for
  `/schools/[code]` — a new lookup key into the same verified-membership machinery, not a parallel
  system.

No schema for any of these should be finalized before a real signal (a paying customer, a specific
request) exists — inventing it now risks the exact "a field or enum value that sounds right but was
never actually decided" trap `TheNiche`'s own plan names as the thing to guard against.
