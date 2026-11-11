# 0046: A campus administrator reaches Results: the marks, the review and the report cards of their own campus (decision D7 of task 0031)

- **Period / Focus:** 2026-11-11 (the maintainer approved D7 on 2026-11-11: "Approve D7, D8 and the 0032 points")
- **Status:** Built and tested; in review (PR into `dev`)
- **Priority:** Medium
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-results-access` / PR into `dev`
- **Started:** 2026-11-11

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

A campus administrator opens Results and works on their own campus: reads its marks, enters and imports them, sends them for review, prints its report cards and writes the teacher's remark. They never reach another campus's pupils, classes or marks, and they approve and publish only when they hold the approval permission, within its scope. Until now they were not on the results API's role lists, so the Results page answered 403 (task 0031, decision D7).

## 2. Context

- Roles on the results API: `STAFF_READ_ROLES` (`ADMIN`, `TEACHING_STAFF`, `NON_TEACHING_STAFF`) and `WRITE_ROLES` (`ADMIN`, `TEACHING_STAFF`) in `src/lib/results/http.ts`; the status change route lists `ADMIN` and `TEACHING_STAFF`; the remarks route uses `WRITE_ROLES`; the report-card routes use `STAFF_READ_ROLES`; the Results page admits the three staff roles and calls `forbidden()` for anyone else.
- The services already take the caller's campus and apply a campus rule for anyone who is not an `ADMIN` (`campusOf` in `service.ts`, `campusAllows` in `sheet.ts`): a member anchored to a campus sees that campus's pupils and classes and the school-wide ones; another campus's is "not found". Nothing in them knows the role `CAMPUS_ADMIN`: an assignment rule applies to `TEACHING_STAFF` only, `ADMIN` is unrestricted.
- ADR 0016 sets how a campus administrator is treated everywhere else (`src/lib/auth/campus-scope.ts`): a row of their campus is theirs; a row of another campus, or an unknown one, is the same 404; a school-wide row (no campus) they may **see but not change** (403). `tests/unit/route-role-guard.spec.ts` fails a route that lets a campus administrator write without calling a campus helper or naming the place where the campus is checked, and today it lists the results routes among those that never name the campus administrator.
- ADR 0018: approving results is the permission `CAN_APPROVE_RESULTS` on a membership plus a scope (the whole campus, or some sections or classes); no scope means no approving. `transitionResultStatuses` enforces it for anyone who is not an `ADMIN`.
- Task 0036 (remarks): the principal's remark is the school administrator's alone; the teacher's is the administrator's or the teacher's of the pupil's class.

## 3. Decisions

- **D1. The role goes on the lists.** `CAMPUS_ADMIN` is added to `STAFF_READ_ROLES` and `WRITE_ROLES` (so to the marks sheet, the import and its template, the results query, the roster, the options, the report-card routes, the remarks route) and to the status-change route. The Results page admits it and draws the Marks, Review and Cards tabs for it.
- **D2. See own campus and the school's; change only own campus (ADR 0016).** Reads (the results list, the roster, the options, the cards and their PDF, a remark) show a campus administrator their campus's pupils and classes and the school-wide ones, as for every member anchored to a campus. Writes (saving marks, importing them, a remark, a status change of a result) are confined to pupils of **their own campus** in classes of **their own campus**: a school-wide pupil or class is refused (403, "That belongs to the whole school. Only a school administrator can change it."), another campus's, or an unknown id, is the one 404 of an unknown id. The whole request is accepted or none of it, as before.
- **D3. No assignment rule, no administrator powers.** A campus administrator is not held to a teacher's subject assignment (they enter any subject their campus's classes offer, as an `ADMIN` does within the campus). They are **not** an administrator of the results lifecycle: approving, rejecting, pulling back, publishing and locking need `CAN_APPROVE_RESULTS` and the scope of ADR 0018, exactly as for a teacher; unlocking a LOCKED result stays the school administrator's. **Found while testing: a campus administrator can never hold `CAN_APPROVE_RESULTS`**: the database constraint `TenantMembership_permissions_staff_only` allows permissions only on the two staff roles, and ADR 0016 says a campus administrator may not grant permissions. So, with this task, a campus administrator enters marks, imports them, sends them for review, reads the review queue and the cards and writes the teacher's remark, and **approving and publishing their campus's marks is done by the school administrator or by a teacher the school has named an approver** (with the campus as their scope). Letting a campus administrator approve for their own campus is a different decision (it needs either a change to the constraint, which is a migration, or a rule in `canTransitionResult` that treats a campus administrator as an approver within their campus); it is offered to the maintainer in section 5 and not built.
- **D4. Remarks: the teacher's remark only.** A campus administrator may write the teacher's remark of a pupil of their campus. The principal's remark stays the school administrator's alone (task 0036); making the campus head the principal for their campus is a decision for the maintainer (section 5).
- **D5. Report cards.** The card and its PDF follow the read rule of D2; the class PDF (at most 100 cards) lists only pupils the administrator may read. Nothing about what a pupil or parent sees changes.
- **D6. The guard test is updated, not weakened.** The results routes leave the "school-only" list of `route-role-guard.spec.ts` and are listed with the place where the campus is checked (`lib/results/...`); a new test asserts, for every results route that lists the campus administrator, a campus administrator of campus A is refused for a pupil, class and result of campus B.
- **D7. No migration, no new permission, no new audit action.** The audit rows already carry the actor's role.

## 4. Work breakdown

- [x] Design (this file).
- [x] `http.ts` role lists; the transition route; `service.ts` (`recordStudentResults`, `transitionResultStatuses`, `queryResults`), `sheet.ts` (`entryOptions`, `getSheet`, `classRoster`), `mark-import-service.ts`, `remarks.ts` / `remarks-service.ts`, the report-card services: the campus-administrator rule of D2 and D3.
- [x] The Results page and the navigation entry for the role.
- [x] Tests: unit (the pure rules), API (a campus administrator of two campuses' worth of fixtures: reads, writes, the 403/404 answers, approve with and without the permission and the scope, the remark, the card, the PDF), browser (the page for a campus administrator, desktop and phone), the guard test; mutation check; regression.
- [x] Docs: the route table (`docs/pages`, `docs/functions`), HANDOVER, tracker, CLAUDE.md banner, task 0031's decision D7.

## 5. Not in this task

- The principal's remark for a campus administrator.
- Grade scales, assessment schemes and subjects stay the school administrator's (school-only routes).
- A campus administrator approving or publishing, even for their own campus (D3: they cannot hold the permission; deciding that they should is the maintainer's).
- Anything about pupils and parents.

## 6. Build record and tests

**Built on** `claude/octalve-results-access`. No migration. New: `src/lib/results/campus-admin.ts` (the pure rules: `mayChangeClass`, `isCampusAdmin`, `ownsNothing`, `pupilsOutsideCampus`, the sentence `OUTSIDE_CAMPUS`). Changed: `http.ts` (the two role lists, the failure `OUTSIDE_CAMPUS` = 403 `FORBIDDEN`), `service.ts` (`recordStudentResults` confines a campus administrator to their campus's classes and calendar; `campusOf` fails closed), `sheet.ts` (`getSheet`, `entryOptions`, `classRoster`), `remarks.ts` and `remarks-service.ts` (the teacher's remark for a class of their own campus), the card route and the card PDF route (`studentReadScope`), the status-change route, the Results page and the sidebar.

**What the build found.**
- A campus administrator can never hold `CAN_APPROVE_RESULTS`: my first fixture gave one the permission and the database refused it (`TenantMembership_permissions_staff_only`: permissions only on the two staff roles). So after this task a campus administrator enters, imports, sends for review, reads the queue and the cards and writes the teacher's remark, and **approving and publishing their campus's marks is the school administrator's or a named approver's** (D3). A test pins the constraint, so if it is ever relaxed the test says this task's premise changed.
- A campus administrator with no campus cannot exist either (`TenantMembership_campus_admin_has_campus`): my first fixture of one failed in `beforeAll`. `ownsNothing` stays as a fail-closed backstop and is tested only as a pure function.
- The first run of the new API spec had one failure, the permission fixture above; the rest passed. The mutation check then found a gap in the tests (C10 below).
- The first complete unit-and-API run of the change was clean; what the older specs pinned (a campus administrator is 403 on the sheet, the roster and the Results page; the menu) was updated, not loosened.

**Tests.**
- Unit `results-campus-admin` (new, 6): `mayChangeClass`, `ownsNothing`, `remarkPermissions`, the role lists, the 403 sentence; `route-role-guard` (extended): every results, report-card and remark handler is named with the place its campus is checked (a new one fails until it is), and the two card routes judge their campus themselves; `shell-nav` (updated): a campus administrator's menu has Results.
- API `results-campus-admin` (new, 17 tests, two campuses, a school-wide class, a pupil of no campus and a campus-only session): entering marks (own campus, a pupil of no campus on the roll of the North class, another campus's pupil 404 and nothing written, a pupil in a class of the whole school 403 and nothing written, another campus's term 404, the administrator unchanged, another school's), reading (the list, the options, the sheet, the class list, a term of another campus's session for both), importing and the template, the review lifecycle (cannot approve; a named approver of the campus approves and publishes what the campus administrator entered and cannot reach South's; unlock refused to both), cards and their PDF, and the remarks (the teacher's, the principal's refused, a class of the whole school 403 with its sentence, another campus 404). `results-sheet` and the browser spec `results-screens` (a campus administrator opens Results with three tabs and no Approve button) updated: they pinned the old 403.
- **Mutation check:** 19 changes, each applied alone to a copy of the code in a test lane and run against the specs above (77 tests on the unmutated code; C9 and C13 against the unit specs only, as they need no build; C14 against the browser spec; C18 and C19 against the same specs plus the API specs that read a card as a teacher, a pupil and a parent, `report-card-access` and `report-card-pdf`: 83 and 89 tests on the unmutated code). C7 and C8 were run again against the route as it is after the fix. Every one is caught:

| | Change | Failed |
| --- | --- | --- |
| C1 | `STAFF_READ_ROLES` without the role | 4: the role-list unit test, the guard test, the API results list, `results-sheet` |
| C2 | `WRITE_ROLES` without the role | 4: the same two unit tests, the API entering test, `results-sheet` |
| C3 | no `pupilsOutsideCampus` check | 1: "a pupil in a class of the whole school ... 403" |
| C4 | no check of the term's own campus when saving | 1: "a term of another campus's own session" |
| C5 | `mayChangeClass` also admits a class of the whole school | 3: its unit test, the options test, `results-sheet` |
| C6 | the sheet no longer refuses a class of the whole school | 2: the sheet and class-list test, `results-sheet` |
| C7 | the card route without `studentReadScope` | 3: two guard tests, the card assertion "card other campus" |
| C8 | the PDF route without `studentReadScope` | 3: two guard tests, the assertion "card/pdf other campus" (C7 and C8 fail the same API test on different assertions, named in the message) |
| C9 | `remarkPermissions` gives a campus administrator the principal's remark | 1: its unit test |
| C10 | the remark service loses its sentence for a class of the whole school | **survived** the first time (the refusal is still a 403 from the permission check, with another sentence); an assertion on the sentence was added; now 1: the remark test |
| C11 | the options offer entry for every class | 1: the options test |
| C12 | the status-change route without the role | 2: the guard's stale-entry test, the lifecycle test |
| C13 | no Results in a campus administrator's menu | 2: both menu unit tests |
| C14 | the Results page refuses the role | 2: the browser test, desktop and phone (a first version of this mutation did not build: TypeScript refused the comparison; it was redone with a cast) |
| C15 | the card route does not pass the viewer's campus to the remarks | 1: "the card tells a campus administrator they may write the teacher's remark" |
| C16 | the class list does not check the term's own campus | 1: the roster assertion of the sheet and class-list test |
| C17 | the sheet does not check the term's own campus | 1: the sheet assertion of the same test (a different line from C16) |
| C18 | the card route asks `studentReadScope` of every role, not only a campus administrator (the bug the first regression run found) | 4: the guard test that checks the structure, and 3 in `report-card-access` (a teacher reads the pupils of their arms; a member of a campus reads that campus's pupils; a pupil and a parent read their own) |
| C19 | the card PDF route does the same | 6: the same guard test, and 5 in `report-card-pdf` (the download and its headers, published and locked results only, the remarks, the payment gate, the audit row) |

A first round of C18 and C19 ran without those two API specs and showed only the guard test failing (1 each); the specs were added to the list so that the wrong-role answer is seen at the API too. The guard test checks that the call sits under `if (auth.tenant.role === "CAMPUS_ADMIN")`, which is the structure that a plain "the call exists" check missed.

**Not mutation-tested:** `ownsNothing` in `campusOf`, `campusAllows`, `entryOptions` and `saveReportRemarks` (a campus administrator with no campus cannot be made, so no request reaches those lines; the function is tested as a pure function).

**Regression.** A clean build in a test lane, then the whole `unit` and `api` projects and the browser specs that touch this change (`results-screens`, `shell`, `results-approvers-screen`, `responsive-and-a11y`, `promotion-screens`), each on desktop and phone. Two runs, and the first one found a real bug.

- **First run, before the card-route fix:** unit and API 23 failed, 2,885 passed; browser 1 failed, 136 passed. Twenty-one of the 23 were in the five API specs that read a report card or its PDF (`report-card-gate` 7, `report-card-pdf` 5, `report-remarks` 4, `report-card-access` 3, `results` 2), and one each in `report-remarks-rules` and `campus-admin-academics`. **Cause:** the card route and the card PDF route called `studentReadScope` for every role, and that helper answers 403 to every role except the school administrator and a campus administrator, so a teacher, a pupil and a parent could no longer read a card. The guard test I had written only checked that the call existed, so it did not see a call made for the wrong roles. **Fix:** both routes call it only `if (auth.tenant.role === "CAMPUS_ADMIN")`, and the guard test now asserts that structure (C18 and C19 below are the mutations that prove it). The 21 card failures cleared with the fix. The other two were older specs pinning behaviour this task changes on purpose (the rule for who may write the teacher's remark; a campus administrator's Results list was 403 and is now 200), and I updated them, not loosened them. The one browser failure was my own new assertion that a sidebar link is visible on a phone, where the sidebar is closed; it now checks the Review tab's `aria-current`.
- **Second run, on the fixed code (clean build, lane 3):** unit and API **2,907 passed, 1 failed**; browser **137 passed, 0 failed**. The one failure was `program-completion.spec.ts:104` ("completing one place": the other school's administrator got 401 where the test expects 403 or 404), a feature this task does not touch. It **passed on its own** straight afterwards (11 of 11), and that run had four test lanes working on one database server at the same time (in the same hour another lane's run reported "too many database connections"). I did not find why that one request was 401, so I call it a failure under load that I could not explain, and I have not run it against a build without this change.

**Not tested, and not claimed.** No deploy. A campus administrator whose campus has no class or no pupil is not tried on the screen (the API answers are tested). The Marks screen's own pickers for a campus administrator are tested in the browser only as far as the page opening with its three tabs; the entry flow is tested over HTTP.
