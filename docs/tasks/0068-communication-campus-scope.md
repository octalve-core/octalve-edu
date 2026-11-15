# 0068: A campus administrator's broadcasts and delivery log stay on their own campus (found by reading the source for the walkthrough's communication chapter, task 0053)

- **Period / Focus:** 2026-11-15 (an authorization finding: a campus administrator can message every guardian and member of staff of the whole school and read every message the school has sent, though the product says they are "scoped exclusively to their physical campus")
- **Status:** Done (design first, then built; the record is section 6)
- **Priority:** High (cross-campus reach by a role that is meant to be confined; recipients' phone numbers and the texts of invoices and results are exposed)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-communication-campus` / PR into `dev`
- **Started:** 2026-11-15

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

A campus administrator who sends a broadcast reaches **their own campus's** guardians and staff and no one else, and the delivery log (and its retry) shows them **only the messages that went to their campus**. The school's administrator is unchanged. The "Campus Scope" choice, which never narrowed the guardians for anyone, now does.

## 2. How it was found, and what is wrong

Reading `src/lib/communication` and its routes for the walkthrough's communication chapter (task 0053, C10). `docs/HANDOVER.md` says a campus administrator is "scoped exclusively to their physical campus", and its rule for new code says a route that lets a campus administrator write "must say where the campus is checked". The broadcast route lists `CAMPUS_ADMIN` and does not; `tests/unit/route-role-guard.spec.ts` lets it through on a list with the reason "campus-level isolation handled in dispatch service". **The dispatch service has no campus logic.** Four defects:

1. **`POST communication/broadcast` ignores the caller's campus.** `createBroadcast(tenantId, authorUserId, body)` is not given the role or the campus. A campus administrator who sends with "All Campuses" (the composer always offers it; its value is empty) messages every guardian and every member of staff in the school, and one who sends the id of another campus (a plain POST) messages that campus.
2. **The campus choice never applied to guardians.** In `service.ts` `campusId` is read in one place only, the staff query. For guardians (the audience "All Community" and "Parents / Guardians") it is not read at all, so even the school's administrator who picks one campus reaches every campus's guardians.
3. **`GET communication/dispatches` shows every dispatch of the school** to a campus administrator: the recipient's address or phone, and the full text of every message (an invoice's amount, a result notice, an absence notice, each with a pupil's name), from every campus. `POST .../dispatches/[id]/retry` re-queues any failed one.
4. **A dispatch row carries no campus** (`NotificationDispatch` has no such column; `metadata` is a free JSON field), so even with the best will the service cannot tell whose a message is.

Not found to be a problem, and left as it is: the templates (the school's own words, read-only to a campus administrator already: `tests/api/communication.spec.ts`) and the queue routes (`GET queue` answers a count; `POST queue/next` sends what is already due for the whole school and answers counts and a reason, never an address: `tests/api/communication-queue.spec.ts`).

## 3. Decisions

- **D1. The route decides the campus, with the helper the announcements already use.** `announcementAudience(auth, { campusId, classArmId }, "create")` (`lib/auth/campus-scope.ts`): for a campus administrator the campus defaults to their own; naming another campus or none-meaning-the-whole-school is `403`; a class arm of another campus is `404`. The school's administrator passes through unchanged. The route passes the resulting campus to the service, so the route calls a campus helper and the guard test's list entry for the broadcast route is removed (it is no longer "elsewhere").
- **D2. The campus is a filter on the recipients, for everyone.** With a campus, a **guardian** is a recipient when at least one of their children, a pupil who is not archived and is linked APPROVED, is on that campus (`StudentRecord.campusId`); a **member of staff** when `StaffRecord.campusId` is that campus. A pupil or member of staff of **no campus** (the whole school) is reached only by the school's administrator choosing "All Campuses": a campus administrator may see them but not message them, the same line task 0046 drew for marks. A class arm and a campus together mean the arm's pupils on that campus (an arm of another campus is refused by D1, so for a campus administrator this only narrows). **With a campus chosen, a guardian's tags (`{{student_name}}`, `{{class_arm}}`) name only the children on that campus**, as they already do for a chosen class arm: otherwise a campus administrator's message to a parent with a child on each campus would carry the other campus's pupil's name, and so would their delivery log.
- **D3. The campus goes on the message.** Every dispatch row made by a broadcast or by an event (an absence, results published, an invoice issued) carries `metadata.campusIds`: the distinct campuses of the pupils the message is about (a guardian's children in scope) or of the member of staff, as strings, an empty list when they have none. No schema change, no migration: `metadata` already exists and the senders already put things in it.
- **D3b. One address, two people.** The broadcast already sends one message per address (two guardians who share a phone get one); that message now belongs to the campuses of both.
- **D4. The delivery log filters on it.** For a campus administrator `listDispatches` adds `metadata.campusIds` contains their campus; a row with no `campusIds` (made before this task) is **not shown** to them: failing closed, as `ownsNothing` does elsewhere. A campus administrator with no campus sees nothing. The school's administrator sees every row as before. `retryDispatch` takes the same condition, so a campus administrator retrying a message of another campus (or an old one) gets the answer an unknown id gets: `400 "Dispatch not found or not in FAILED status"`.
- **D5. The composer and the page.** For a campus administrator the "Campus Scope" lists their campus only (no "All Campuses") and has it selected, and the "Class Arm" list holds the classes of their campus only (the page used to hand them every class of the school, and another campus's would now be refused). Nothing changes for the school's administrator.
- **D6. The whitelist text is corrected.** The guard test's reason for the communication routes said the isolation was in the dispatch service; it now says where it is.
- **D7. Old rows.** Rows made before this task have no `campusIds`: a campus administrator does not see them, and the school's administrator is unaffected. The hosted databases start empty (`docs/DEPLOYMENT.md` 2.3), so for a real school this concerns none.

## 4. Not in this task

The queue routes (above); a campus column on the dispatch table (a migration; `metadata` does the job without one and can be promoted later); the other screens that choose a term (task 0067); the message a campus administrator sees when their broadcast reaches nobody (task 0069, separate).

## 5. Work breakdown

- [x] Design (this file).
- [x] `tests/api/communication-campus.spec.ts` (8 tests): two campuses with a pupil, a guardian and a member of staff on each, a pupil and a member of staff of no campus, a guardian whose two children are on different campuses; a school administrator and a campus administrator of each campus. Who a broadcast was queued for, the campus each message carries, what the log shows and what a retry may touch, all read back from the database. Failing first on the unfixed code.
- [x] `tests/e2e/communication-campus.spec.ts` (3 tests, desktop and phone): a campus administrator's composer offers their campus only, selected, and their campus's classes only; a broadcast through the confirm dialog reaches their campus's people only; the log lists their campus's messages only; axe and overflow in both themes. Failing first on the unfixed build (split in three so each fails for its own reason).
- [x] The fix: the broadcast route (`announcementAudience`), `service.ts` (recipient filter, `campusIds`, `DispatchScope`, `listDispatches`, `retryDispatch`), `event-triggers.ts` (`campusIds` on six messages), the two dispatch routes, the page, `CommunicationPanel.tsx` and `BroadcastComposer.tsx` (100 lines added, 22 changed in 8 files; no schema, no migration).
- [x] The route-guard list and its text; catalogue rows; tracker TASK-0068; HANDOVER 6.39.
- [x] Gates in the order tsc, lint, build, tests; Prettier `--check` on the changed files.

## 6. Build record and tests

**Build record (2026-11-15, worktree `octalve-edu-walk`, `TEST_LANE=2`, a production build of exactly the tree tested).**

- Gates in order: `tsc --noEmit` exit 0; `eslint` on the communication library, routes, components and page and on the three spec files exit 0; `pnpm build` exit 0; Prettier `--check` clean on the changed files (the five source files that needed it were clean at `HEAD`, so `--write` touched only my lines); the catalogue verifier 860 rows, 0 missing.
- **Failing first, the API spec** on the unfixed code (the spec present, `src` as on `dev`): **7 failed, 2 passed** (the two: the `setup` project, and the control test that the school's administrator with no campus chosen reaches everyone, true before and after). What it showed: a campus administrator of North who named no campus **reached 7 recipients, not the 3 of their campus**; naming South's campus answered **201, not 403**; the school's administrator choosing a campus reached every campus's guardians; no queued message carried `campusIds`; and a campus administrator retrying another campus's failed message got **200, not 400**. A first run failed in the fixture, not in the product (the database allows one primary guardian per pupil and I had made two); fixed and rerun on the same unfixed code.
- **Failing first, the browser spec**, on the unfixed build, desktop and phone: **6 failed, 1 passed** (the setup), each of the three tests failing for its own reason: the Campus Scope list was `["All Campuses", "North"]`; the Class Arm list included South's class; the confirm dialog said `Audience: ALL (All Campuses)`. A first version of this spec was one test and failed at its first line, which could not say whether the later parts were also wrong, so it was split in three before the record was taken.
- **The fixed build:** `unit` **1267 passed**; `api` (the new spec, `communication`, `communication-queue`, `communication-tags-recipients`): **32 passed, 0 failed**; browser, desktop and phone, `TEST_TIMEOUT_SCALE=2` (the new spec, `communication`, `communication-composer-tags`, `communication-batches`, `info-tips`, `shell`): **97 passed, 0 failed, 50 skipped**. The skips are those specs' own viewport conditions (`shell`: the sidebar exists from the large breakpoint up; `info-tips`: no hover on a phone, and the tap test the other way); none is in the new spec, which ran all three tests on both viewports. The route-guard test, in `unit`, passes with the broadcast route off its list.

**Not run, and not claimed:** `integration` and `https` projects (the three event triggers' integration spec is in `integration`: the absence trigger is covered by the new API spec, and the results-published and invoice-issued triggers get the same one-line `campusIds` change through the same helper but are not themselves tested for it), the whole suite, the whole responsive spec (the new browser spec runs axe and overflow in both themes on the screen that changed), mutation passes (deferred to the end of PHASE 2). **No migration, no environment change.**

**For the maintainer (open, not changed):** the queue routes still count and send the whole school's due messages for a campus administrator (counts and a reason only, no address); a message made before this change has no campus, so a campus administrator does not see it (the hosted databases start empty); a campus column on the dispatch table would replace the `metadata` filter if the log grows large.
