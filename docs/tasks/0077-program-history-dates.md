# 0077: A program person's history shows its dates in the browser's own format (found by the walkthrough's program-people chapter, task 0053)

- **Period / Focus:** 2026-11-17 (a formatting defect seen on the screenshot of chapter C16, step 141)
- **Status:** Done (the record is section 5)
- **Priority:** Low (the dates are right, only their shape differs from every other date of the Programs screens)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-program-history-dates` / PR into `dev`
- **Started:** 2026-11-17

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Every date and time the Programs screens print has one shape ("17 Nov 2026, 14:24", `en-GB`, from `when()` in `components/programs/model.ts`). The history of a person's place in a program printed its times as the browser's own locale does.

## 2. How it was found, and what is wrong

Walkthrough chapter C16, step 141 (a person's history, opened from the People tab): the dialog's rows read **"Details changed · Amina Yusuf · 11/17/2026, 2:24:00 PM"**, while the same page's rows read "joined 17 Nov 2026". `ProgramPeopleTab.tsx` formats the time with `new Date(row.at).toLocaleString()`, with no locale. It is the only Programs component that does (the Attendance, Assessments and Fees tabs and the progress record all call `when()`). Two consequences: a reader whose browser says `en-US` sees month before day, which on 3 May reads as 5 March to everyone else on the same page; and the seconds are printed.

## 3. Decisions

- **D1. Use `when()`**, the formatter the other Programs tabs use, not a second one. `ProgramPeopleTab.tsx` already imports from `./model`.
- **D2. A guard test, not a rendered one.** The People tab has no browser test, and a seeded browser test for a one-word change would be larger than the change. `tests/unit/programs-date-format.spec.ts` reads every file in `src/components/programs/` and fails on a `toLocaleString()`, `toLocaleDateString()` or `toLocaleTimeString()` with no arguments, so the next screen cannot do it either. Its detector is itself tested on a line it must find and a line it must leave (`toLocaleDateString("en-GB", ...)`).
- **D3. Only the Programs components.** The same call is made without a locale in other modules (listed in section 4); each is a different screen with its own tests and its own reader, so they are not changed here.

## 4. Not in this task

Seen with the same search (`toLocale(Date|Time)?String()` with nothing between the brackets), and left: `finance/InvoiceDetailView.tsx` (6 places), `communication/DispatchLogsView.tsx` (1), `lms/LmsPanel.tsx` (2), `auth/SessionsPanel.tsx` (2, in `title` attributes), `announcements/AnnouncementsFeed.tsx` (1). Several of them print an amount with `toLocaleString()` (`₦`), which is a different question (thousands separators), and the e-mail and message text in `lib/communication/event-triggers.ts`.

## 5. Build record and tests

**Build record (2026-11-17, worktree `octalve-edu-walk`, `TEST_LANE=2`, `TEST_TIMEOUT_SCALE=2`; `dev` at `48939b8`).**

- **Failing first**, with `src` identical to `dev`: `tests/unit/programs-date-format.spec.ts`: **1 failed, 1 passed**. The one that passed is the detector's own test (a line it must find, a line it must leave); the one that failed is the scan, and it named exactly one place: `ProgramPeopleTab.tsx:396`.
- **The fix:** `ProgramPeopleTab.tsx` imports `when` from `./model` and prints `when(row.at)` (two lines).
- **Gates in order, on the fixed tree:** `tsc --noEmit` exit 0; `eslint` on the source and the spec exit 0; `pnpm build` exit 0; Prettier `--check` clean on the changed files (`ProgramPeopleTab.tsx` was clean at `HEAD`).
- **The fixed tree:** `unit` **1271 passed** (1269 before, plus the two new tests), including the new spec.
- **Seen on the screen, not re-run:** the history dialog's rows now read the shape of every other Programs date (the walkthrough's chapter C16 reads the dialog's first row and is re-run in the same sitting as this task's PR is merged).

**Not run, and not claimed:** `api`, `integration`, `https` (no route or schema changed), the browser suite (no People tab browser test exists; the guard test is source-level by design, D2), mutation passes (deferred to the end of PHASE 2). **No migration, no environment change.**

