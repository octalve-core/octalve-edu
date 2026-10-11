# [0010]: Platform follow-ups - counters, first-administrator re-invite, teachers' attendance scoping, public verification, campus-admin setup controls

- **Period / Focus:** 2026-10-11 to (open) - the backlog the maintainer approved after TASK-0009 ("go on with all your recommendations")
- **Status:** In Progress - design committed; no code yet
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/platform-followups` -> octalve-core `dev` (F5 in its own PR)
- **Started:** 2026-10-11 UTC
- **Ended:** -
- **Duration:** -

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Close what TASK-0009 left open: the platform page shows coarse counters and which schools have no administrator (F1), a platform administrator or an operator can re-issue a lost first-administrator invitation (F2, ISS-0015), a teacher reads attendance only for their campus and their own arms (F3, ISS-0013), the public verification page no longer shows the admission number (F4, ISS-0008), and a campus administrator can edit their campus's academic setup in the UI (F5).

## 2. Context & Related Docs
- Plan: "Build design - platform follow-ups (2026-10-11)" (F1-F5). ADR 0016 (Proposed) amended in the same design commit.
- Maintainer answers (2026-10-11): member counts are required; build BOTH the platform re-invite action AND the operator script; teachers' attendance scoping at campus level AND arm level now; show the student's name IN FULL on public verification.
- Issues: ISS-0008, ISS-0013, ISS-0015.

## 3. Work Breakdown
### F1: counters
- [ ] tests first (integration + API + e2e), seen failing
- [ ] migration (additive): `TenantStats`, triggers, backfill, `tenant_stats_recompute`, `platform_school_stats`; Prisma model
- [ ] service, route output, Platform page
### F2: re-invite the first administrator
- [ ] tests first (API + integration + script)
- [ ] migration (additive) `platform_authorize_first_admin_invite`; service; route; Platform page button
- [ ] `scripts/invite-first-admin.mjs` + `pnpm platform-admin:invite-first-admin`
### F3: teachers' attendance reads and roll-call writes
- [ ] tests first (campus x arm matrix), existing attendance spec adjusted on purpose
- [ ] service/route rule; arm picker filtered
### F4: public verification
- [ ] test first; service, route header, form
### F5: Academic setup editing for a campus administrator (own PR)
- [ ] e2e + axe both themes first; UI

## 4. Verification
Gate order: typecheck -> lint -> format:check -> build -> tests. Results are recorded here as they happen. Mutation passes: NOT RUN - pending, end of Phase 2.

## 5. Not decided / waiting on the maintainer
Accept ADR 0016 (amended) and ADR 0014 (AlEemaan).
