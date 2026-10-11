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
- [ ] tests first (API matrix: campus admin own campus ok, other campus 404, school-wide row 403, staff/students; import/export)
- [ ] `PEOPLE` write roles + service checks; people pages (`canEdit`)
### Slice B2: academics of a campus, attendance, announcements, timetable
- [ ] tests first; role lists + service checks; pages
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
