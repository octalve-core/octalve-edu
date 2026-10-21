# 0018 — Results are approved by assignment: generally, per section or per class

Status: Proposed
Decided by: the maintainer for the shape (general, per section, per class, set by the administrator; an approver sees and acts on what is assigned, a general approver on the whole campus) · Date: 2026-10-21. The details under "Proposed details" are an agent's defaults and wait for the maintainer's yes.
Recorded: 2026-10-21 (drafted by an agent)

## Context

- Approving results is one on/off permission today: `CAN_APPROVE_RESULTS` on a membership (`prisma/schema/tenancy.prisma`; staff roles only, an `ADMIN` implies it). `src/lib/results/rules.ts` gates approve, return, publish, revert and lock by it, and `transitionResultStatuses` adds only the campus rule. Nothing asks which class a result belongs to, so an approver can act on every result of their campus.
- The results list for a teacher follows the arms they are assigned to (task 0018). A teacher who holds `CAN_APPROVE_RESULTS` was given the campus-wide list as an interim exception, a decision made without asking; the maintainer's answer replaces it.
- Schools approve by level: the head of the primary section approves the primary classes, a coordinator the JSS classes, one person the whole campus. The model has no "section": `ClassGroup` has a name, a sort order and a campus.

## Decision

- **An administrator assigns each approver one or more scopes** in the school's settings: **General** (every class of the person's campus; the whole school for a membership with no campus), **Section** (every class group in a named section of a campus) or **Class** (one class group, all its arms).
- **The scope governs both what the approver sees and what they may do:** the results list, and approve, return, publish, revert and lock. One function answers "which arms may this person approve for", and both the list and the transitions use it, so the two cannot drift apart. A result is in scope when its student's ACTIVE enrolment in the period's session is in an arm of an in-scope class group.
- **Out of scope:** a result the approver may not act on is absent from their list, and an action on it is refused like a missing permission (the transition's usual `UNAUTHORIZED`), because the person may well see it (a teacher sees the arms they teach); a batch that holds one such result moves nothing. A result the caller cannot see at all (another campus) stays "not found", as now.
- **A section is a small new thing:** `Section` (school, optional campus, name, sort order) and a nullable `ClassGroup.sectionId`. A class group with no section is reached only by a General or a Class scope.
- **`CAN_APPROVE_RESULTS` stays the capability; the scope says where. No scope means no approving (fail closed).** The migration gives every current holder a General scope on their own campus, so nothing changes on the day it is deployed.
- **Who may change it:** only an `ADMIN` (never delegable, like permissions), every change audited with before and after, and the administrator re-types their password first, as for the question-bank settings.
- **Unchanged:** a teacher's own submit (DRAFT to SUBMITTED) is not an approval and is not scoped by this; a teacher-approver sees the union of their assigned arms and their approver scope; the author of an entry cannot approve it (an `ADMIN` may); an `ADMIN` is held to no scope and a campus administrator to their campus.

## Proposed details (need the maintainer's yes)

1. A section belongs to one campus (or to the school when the school has no campuses), and a class group is in at most one section.
2. "Per class" means the class group (JSS 2 with all its arms), not a single arm.
3. Only the school's `ADMIN` assigns scopes; a campus administrator does not (the same rule as permissions).

## Alternatives Considered

- **Keep one permission and the campus rule:** a primary head could approve senior-section results. That is the gap this closes.
- **Store the scope as a list of ids on the membership (like `permissions`):** no foreign keys, so a deleted class leaves a dangling id, and no row-level security target. A table with its own policy is the pattern of every other tenant table.
- **A text label on `ClassGroup` instead of a section:** the settings page has nothing to offer, and a typo splits a section in two.
- **Scope by arm or by subject:** not asked for. Arms are what a teacher is assigned to, so an `ARM` kind can be added later without changing the shape.

## Consequences

- One migration (the maintainer runs it on the hosted database before the code is deployed there), row-level-security policies for the two new tables, a settings screen, a change to the results rules and list, and AlEemaan after it (branches for campuses, the superadmin for the administrator).
- Setting up a school takes one more step (define sections, assign approvers). The default that keeps today's behaviour is a General scope.
- **Revisit if:** a school needs approval by subject or by arm, or two stages of approval (a head of department, then the principal).

## Enforced by

Tests to be written with the code: an API matrix of scope (general, section, class, none) by action (list, approve, return, publish, revert, lock) by in-scope and out-of-scope result, `integration/rls` for the new tables, a unit test of the scope function, and the route-area guard for the new routes. Review only until they exist.

## Binds

- `prisma/schema/tenancy.prisma`, `prisma/schema/academics.prisma` (the new tables)
- `src/lib/results/rules.ts`, `src/lib/results/service.ts` (list and transitions)
- `src/lib/members/` (who may change scopes)
