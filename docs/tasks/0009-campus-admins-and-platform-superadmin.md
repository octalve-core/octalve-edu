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
- [ ] tests first; invoices scoped to the campus's students; manual payment; discounts and fee structures stay school-only
### Slice B4: members and invitations, and enabling the role
- [ ] tests first; campus-scoped Users page and API; **only now** may a membership/invitation be given `CAMPUS_ADMIN`; last-ADMIN rule counts `ADMIN` only
### Slice C: platform
- [ ] suspension: resolver and the person's school list treat a suspended school as absent
- [ ] `scripts/make-platform-admin.mjs` (+ script entry); step-up MFA required for platform actions
- [ ] platform API + page (list, create, suspend/reinstate, set type, history)
### Slice D: guard, docs, gate
- [ ] route-role guard test (every handler declares `roles:` or is allowlisted; a handler that writes a campus row asks `canAdminister`)
- [ ] ADR 0016 (Proposed), plan "As built", CLAUDE.md rule, tests/README, issues register
- [ ] full one-lane suite; PR into `dev`

## 5. Notes, Findings & Deviations
- **Deviation from C5 (accepted by nobody yet — the maintainer should see it):** `platform_list_schools()` returns no member counts. A count needs a cross-tenant read, which is the bypass C5 forbids, and under FORCE RLS a definer function owned by a non-superuser could not do it anyway.
- **Order is a safety property:** nothing can hold `CAMPUS_ADMIN` until slice B4, so routes extended earlier are inert; do not move B4 earlier.
- The campus FK is `ON DELETE SET NULL`: with the new CHECK, deleting a campus that has a campus administrator fails instead of silently making them school-wide. There is no campus-delete feature; if one is built it must reassign first.
- Mutation pass: not run — pending, end of Phase 2 (targets: the CHECK, the campus comparison in `canAdminister`, "cannot touch an admin", `platform_assert_admin`, the platform-admin-reads-nothing guarantee).
