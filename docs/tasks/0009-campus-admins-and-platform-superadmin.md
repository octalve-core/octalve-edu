# [0009]: Campus administrators and the platform superadmin (build of design C1–C8)

- **Period / Focus:** 2026-10-11 → (authorization model change; multi-tenant, RLS must not weaken)
- **Status:** In Progress — slice A done
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/campus-admins-platform-superadmin` → octalve-core `dev`
- **Started:** 2026-10-11 UTC
- **Ended:** —
- **Duration:** —

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
A school can appoint a **campus administrator** who runs one campus (`TenantMembership.role = CAMPUS_ADMIN`, campus required), and the **platform** has a superadmin (`User.isPlatformAdmin`) who can list/create/suspend schools and set a school's type — **without any access to a school's data** (no RLS bypass).

## 2. Context & Related Docs
- Plan: "Build design — campus administrators and a platform superadmin" (C1–C8) and the maintainer's answers (2026-10-11): role value, not a flag; campus admin manages staff/students/guardians of their campus below admin level; records manual payments and sees their campus's invoices but does not configure fee structures; platform superadmin sees no school data now, **audited support access wanted later (design first)**; a suspended school simply cannot sign in.
- ADR 0001 (RLS), ADR 0010 (`DEFAULT_SCHOOL_TYPE`), ADR 0006 of this repo's permission design (no delegation of grants), new **ADR 0016 (Proposed, drafted with the code)**.
- AlEemaan's equivalent (done): `branch-admins-superadmins`, ADR 0014.

## 3. Scope correction to the design
The design said "25 route files (of 108) name `ADMIN`". That counted one pattern. **81 API route files name `ADMIN`** (many through the `WRITE_ROLES` constants in `lib/*/http.ts`), plus ~10 pages. The three groups below are the real work list.

### Route groups (decision rule: a campus admin acts only where the row has a campus and it is theirs)
- **Campus-capable (CAMPUS_ADMIN added, `canAdminister(tenant, row.campusId)` enforced in the service):**
  - people: students (create/update/archive/restore/import/export, enrolments, guardian links), staff (create/update/archive/restore, assignments, invite, link/unlink account), guardians (via their linked students' campus)
  - academics of a campus: sessions family (`sessions/*`, periods, copy-forward, close/reopen/activate/archive) and class groups family (`class-groups/*`, arms, subject offerings) — only rows with a campus; a **school-wide row (`campusId` null) is refused**
  - attendance (mark/read for the campus), announcements (own campus, not school-wide), timetable (via the class arm's campus)
  - finance: list/view **their campus's invoices** and record a **manual payment** on them
  - members/invitations: campus members below admin level, invitations only to their campus and never `ADMIN`/`CAMPUS_ADMIN`
- **School-only (CAMPUS_ADMIN refused; unchanged):** school settings, campuses (create), fee structures and invoice discounts, permission grants, subjects, assessment schemes, grade scales, results transitions, anything that makes/changes an `ADMIN` or `CAMPUS_ADMIN`.
- **Unchanged:** staff/student/parent routes, public verification, auth, webhooks.
- **Not granted yet (conservative; the maintainer can widen):** results (no role for a campus admin), report cards.

## 4. Work Breakdown
### Slice A: foundation — DONE (`2d1f495`)
- [x] Migrations: `CAMPUS_ADMIN`; CHECK; `User.isPlatformAdmin`; `Tenant.suspendedAt`; `PlatformAuditLog` (RLS, no policy for `app_user`); `platform_*` SECURITY DEFINER functions
- [x] `lib/auth/administer.ts` (`canAdminister`, `isAdministrator`); `ROLE_LABELS`
- [x] Tests: `tests/unit/administer.spec.ts` (5), `tests/integration/platform.spec.ts` (13); catalog guard list; applied to the `octalve_edu` dev DB
### Slice B1: people
- [x] tests first: `tests/api/campus-admin-people.spec.ts` (10), seen failing first (8 of 10 failed against the unchanged routes, for the right reason)
- [x] `CAMPUS_WRITE_ROLES` on every people write route + `lib/auth/campus-scope.ts` helper called before the service; create defaults to the caller's campus; import honours the campus (row error otherwise); staff link candidates limited to the campus; people pages let a campus administrator in (`canEdit` = `isAdministrator`)
- Slice B1 result (2026-10-11): people spec 10 passed after `pnpm build`; typecheck, lint clean. NOT run yet: the full suite, existing people specs, e2e.
- Deliberate limits: `GET staff/[id]/linkable-accounts` and `link-account` are limited to members of the caller's campus; the Academic setup page stays READ-ONLY for a campus administrator in the UI for now (the API for sessions/classes is slice B2); results and report cards are not granted.
### Slice B2: academics of a campus, attendance, announcements, timetable
- [x] tests first: `tests/api/campus-admin-academics.spec.ts` (15); 12 of the 15 failed against the B1 build (for the right reason: 403 on routes the role was not yet on), 3 passed (the read/refusal cases that were already true)
- [x] **Academics** (17 write routes + the two create routes): `CAMPUS_WRITE_ROLES` with `sessionScope`/`periodScope`/`classGroupScope`/`armScope` after the rate-limit check; `POST sessions` and `POST class-groups` use `createCampus` (default = own campus; other or null = 403). Subjects, grade scales, assessment schemes and results stay school-only (tested: 403).
- [x] **Attendance:** `lib/attendance/http.ts` read/write lists + `CAMPUS_ADMIN`; `canEditAttendance` treats it like an ADMIN (any past date, never the future); roll-call POST is campus-checked with `armScope` (only for `CAMPUS_ADMIN` — teachers keep their behaviour); reads use `armReadScope` / `studentReadScope` (own + school-wide visible, another campus 404).
- [x] **Announcements:** role lists; `announcementAudience` (create: campus defaults to own, other/none = 403, a named class arm must be the campus's); `announcementScope` on edit/delete; `canManageAnnouncement` lets a campus administrator manage their campus's announcements whoever wrote them (the editor carries `campusId`, so the rule is checked in the service too); the feed shows them their campus's announcements in every state.
- [x] **Timetable:** role lists; `armsScope` on create, on every slot of a batch (all-or-nothing: one other-campus arm refuses the batch and nothing is written, including `replaceExisting`), `timetableSlotScope` on edit/delete plus `armsScope` on a changed `classArmId`.
- [x] **Pages:** the Academic setup page admits the role (still READ-ONLY for it in the UI — the API is writable, the editing UI is a later change); the announcements feed lets a campus administrator author, and manage their campus's items; the composer has no "All Campuses" for them.
- **Found, not fixed (pre-existing, affects TEACHING_STAFF):** `GET arms/[id]/attendance` and `GET people/students/[id]/attendance` do not hide another campus's arm/student from a teacher of a different campus (the roll of an arm of another campus, whose pupils row-level security hides, still names the arm; the history route returns the student). Teacher-side scoping is outside this task; recorded in the issues register.
- Slice B2 result (2026-10-11): campus-admin-academics spec 15 passed after `pnpm build`; typecheck, lint clean. Regression run of the existing academics/attendance/announcements/timetable/people/idor specs: see below.
### Slice B3: finance
- [x] tests first: `tests/api/campus-admin-finance.spec.ts` (8). Against the B2 build 5 failed and 3 passed; one of the five failures was NOT about campus administrators: a parent's invoice list held another family's invoice (**ISS-0014, P1, pre-existing**) - fixed in this slice with the same spec.
- [x] **List and view:** `invoiceVisibility` in `lib/finance/service.ts` decides who sees which invoices - finance staff (ADMIN or `CAN_MANAGE_FINANCE`) all; a campus administrator only their campus's students' (it wins over a permission); a student or guardian only their own / their approved linked children's. `getStudentInvoice` has the matching campus branch. `queryInvoices` now takes the requester (a required argument, so a caller cannot forget it).
- [x] **Manual payment:** `CAMPUS_ADMIN` added to the roles; for that role the route asks `invoiceScope` first (another campus's invoice, a student with no campus, or an unknown id = the same 404). A bursar holding `CAN_MANAGE_FINANCE` is school-wide and unchanged (my first version applied the scope helper to every caller and broke the bursar's existing test - caught by the existing finance spec, fixed by gating on the role).
- [x] **Stays school-only (tested 403):** generating invoices, fee structures (read and write), discounts, online payment.
- Decision: an invoice of a student with NO campus is the school administrator's alone - 404 to a campus administrator (money records are not "visible but off-limits" like a school-wide class).
- Slice B3 result (2026-10-11): campus-admin-finance 8 passed; with finance, finance-adversarial, idor-audit and tenant-boundary = 59 passed, 0 failed; typecheck, lint, format:check clean. NOT run: the full suite, e2e.
### Slice B4: members and invitations, and enabling the role
- [x] tests first: `tests/api/campus-admin-users.spec.ts` (9). Against the B3 build 6 failed (for the right reason) and 3 passed (two ADMINs demoting each other at once leaves exactly one - already true, kept as a guard now that campus administrators exist; and the campuses/settings refusals).
- [x] **Rules live in the SERVICES, not the routes** (so a route cannot forget them): `campusActorRefusal` in `lib/members/service.ts` and `campusActorInvitationRefusal` in `lib/invitations/service.ts`. For a `CAMPUS_ADMIN` actor: a member/invitation of another campus or of no campus (the school's administrators, people not placed on a campus) = `NOT_FOUND` (the same 404 as an unknown id); one at their own level or above = `ADMIN_ONLY` (403); a change that would make someone administrator-level, move them to another campus or to the whole school, or grant a permission = `ADMIN_ONLY`. Invitations default to the actor's campus (an explicit other campus or null = 403; role ADMIN/CAMPUS_ADMIN = 403). Lists are the actor's campus only (a filter naming another campus is a 403, not an empty answer).
- [x] **Enabling the role (and the bug this exposed):** `CAMPUS_ADMIN` was already assignable through the members/invitations API once slice A added the enum value (the roles list is `Object.values(Role)`) - contrary to my note that earlier slices were inert. With no campus it would have hit the database CHECK and answered 500 at acceptance. New failure `CAMPUS_REQUIRED` (400 VALIDATION, `body.campusId`) for inviting/changing someone to CAMPUS_ADMIN without a campus and for clearing the campus of one. The window between slice A and this commit existed only on unpushed branches, so no deployed school was exposed.
- [x] **Last-ADMIN rule counts ADMINs only** (already how `hasAnotherActiveAdmin` queried; now covered by a concurrent-demotion test with a campus administrator beside them).
- [x] **UI:** the Users page admits a CAMPUS_ADMIN (their campus only, no campus filter); role choices exclude Administrator/Campus administrator for them; the invite campus is theirs and fixed; the edit dialog cannot move a person or grant permissions (explained in words); controls are hidden for members at their own level. For an ADMIN the role list now includes "Campus administrator" and the campus choice says "Choose a campus" instead of "No specific campus" when that role is picked. The side nav gives a CAMPUS_ADMIN Overview, Academics, People, Users (no Settings).
- Changed an earlier test on purpose: `campus-admin-people.spec.ts` asserted `GET members` was 403 "until their slice"; it is now 200 by design and covered by the new spec. `tests/integration/invitations.spec.ts` got a type-narrowing line only (`resendInvitation` can now also answer `"ADMIN_ONLY"`).
- Slice B4 result (2026-10-11): campus-admin-users 9 passed; with members, invitations (api + integration), campuses, tenant-boundary, campus-admin-people, people-staff = 145 passed after the two fixes below; users e2e desktop + phone 33 passed (31 existing + 2 new... plus the unit nav test 1); typecheck, lint, format:check clean. NOT run: the full suite.
- Deliberate limit: a parent or student with no campus on their membership is invisible to a campus administrator on the Users page (they appear through the People pages via their linked student).
### Slice C: platform
- [x] **Suspension:** `resolveTenant` and `getUserMemberships` treat a suspended school as absent (`tenant.suspendedAt = null` in the membership query): a member gets the same 403 a stranger gets, the school drops out of `/auth/me` and the dashboard, nobody's membership is touched, reinstating gives everything back.
- [x] **`scripts/make-platform-admin.mjs`** (`pnpm platform-admin:make -- <email>`): idempotent, case-insensitive, audited in `PlatformAuditLog`, tells the person to turn on two-step verification if they have not; connects with `DIRECT_URL` (the platform audit table has no policy for the runtime role, on purpose). Its test (4) was written together with the script, not seen failing first.
- [x] **Platform API** `/api/v1/platform/{schools,schools/[id],schools/[id]/suspension,audit}` (`lib/platform/{guard,http,service}.ts`): a platform administrator WITH two-step verification, read from the database on every request (a school administrator, an ordinary member, signed-out and a platform administrator without two-step are refused — 401/403 FORBIDDEN/403 MFA_REQUIRED); the **password again for every change** (the existing re-auth proof: 403 WRONG_PASSWORD, rate-limited); create = school + first-administrator invitation in ONE transaction (`trustedTenantId` justified in `verified-tenant.ts`); suspension needs a typed reason; type change refused once the school has any period (409 HAS_PERIODS); `GET` list is identity data only. Everything goes through the `platform_*` functions; nothing reads a school's tables except the new school's first invitation.
- [x] **Platform page** `/platform` + a "Platform" link in the nav for a platform administrator (display only): list, create dialog, suspend (reason), reinstate, change type, history. A platform administrator without two-step verification is told to turn it on. Anyone else gets the usual 403 view.
- [x] **Sessions:** `completeSignIn` gives the shorter absolute cap (7 days) to a CAMPUS_ADMIN and a platform administrator as well as an ADMIN (tested).
- Tests: `tests/api/platform.spec.ts` (10), `tests/integration/make-platform-admin-script.spec.ts` (4), e2e `tests/e2e/platform.spec.ts` (3 x desktop + phone, axe on the page and each dialog in the default theme), unit nav (1). The API spec and the page were written together with the code, not seen failing first (the first run failed on my own test mistakes: the test password, and more than five wrong passwords in a window tripping the re-auth limit — which is the limit working).
- Slice C result (2026-10-11): platform API 10, script 4, e2e 7 (3 x 2 + setup), unit nav 14; regression api+integration (login, mfa-login, session-endpoints, tenant-boundary (+solo), setup, deactivated-members, platform x2, rls) = 213 passed, 0 failed. typecheck, lint, format:check clean. NOT run: the full suite; axe in the dark theme for the platform page.
- Not done (deliberate): the platform page does not show member counts or any school data (C5 deviation, above); a first-administrator invitation cannot be re-sent from the platform page (invite again from the school once an administrator exists; if the first mail is lost the platform administrator can create the invitation again only by contacting the maintainer — **open question for the maintainer**); audited support access is its own design.
### Slice D: guard, docs, gate
- [ ] route-role guard test (every handler declares `roles:` or is allowlisted; a handler that writes a campus row asks `canAdminister`)
- [ ] ADR 0016 (Proposed), plan "As built", CLAUDE.md rule, tests/README, issues register
- [ ] full one-lane suite; PR into `dev`

## 5. Notes, Findings & Deviations
- **Deviation from C5 (accepted by nobody yet — the maintainer should see it):** `platform_list_schools()` returns no member counts. A count needs a cross-tenant read, which is the bypass C5 forbids, and under FORCE RLS a definer function owned by a non-superuser could not do it anyway.
- **Order is a safety property:** nothing can hold `CAMPUS_ADMIN` until slice B4, so routes extended earlier are inert; do not move B4 earlier.
- The campus FK is `ON DELETE SET NULL`: with the new CHECK, deleting a campus that has a campus administrator fails instead of silently making them school-wide. There is no campus-delete feature; if one is built it must reassign first.
- Mutation pass: not run — pending, end of Phase 2 (targets: the CHECK, the campus comparison in `canAdminister`, "cannot touch an admin", `platform_assert_admin`, the platform-admin-reads-nothing guarantee).
