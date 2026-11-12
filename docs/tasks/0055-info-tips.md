# 0055: Info icons: a short explanation of an item or a section, on hover, in the same way everywhere

- **Period / Focus:** 2026-11-12 (the maintainer: "in both apps, I want to add the info icon to many places such that when hovered on, it displays information for the user to understand that item or section of the App, but make sure the info icon does not disfigure the design")
- **Status:** Built and tested; PR into `dev` (later modules are their own PRs)
- **Priority:** Medium
- **Assignee:** Claude
- **Target Branch / PR:** `claude/info-tips` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

The same component and the same rules as AlEemaan's task 0054 (its design record is there and in `docs/tasks/0054-info-tips.md` of that repository: read it for the reasoning), so the two products look and behave alike: a small "i" beside a thing, a short plain explanation on hover, keyboard focus or tap, and nothing else around it changes.

## 2. Context

- `src/components/ui/InfoTip.tsx` is AlEemaan's final component, copied unchanged. It already carries the two fixes found by AlEemaan's browser runs: the popover is measured parked far outside the window (`position: fixed` at -9999px), because parking it at the window's corner or beside the icon made Chrome scroll the page up by 227 px, and a popover placed beside a phone's right edge widened the page. Cause inside Chrome not known (bisected).
- **The words are Octalve's own** (`src/components/ui/info-tips.ts`), checked against Octalve's own screens: not one of AlEemaan's tips was copied. Several of AlEemaan's do not apply here because this product already prints that text (the Classes and Subjects headings, the scheme's "Applies to", the assessment scheme's lock), and some rules differ (Octalve's attendance edit window is for teaching staff and administrators; there is no fixed total of 100 for a scheme; a session closes by a countdown).
- Octalve prints a description under most headings, so a tip here carries a rule or a lifecycle the printed line does not: that is why six tips, not more.

## 3. Decisions (mine; the maintainer may correct)

All of AlEemaan's D1 to D12 apply (a fixed accessible name "More information" so no existing locator collides by substring; Escape closes a tip wherever the focus is; always a sibling of what it explains; one registry; two sentences at most; no setting to hide them; English only). Here:

- **D1. An `info` prop is added to `SelectField` and `TextField`** (the first screens that use them: the People filters and the promotion pass mark). `CheckboxField`, `TextAreaField` and the page header are not touched until a screen uses them.
- **D2. Six tips**, each checked against the source (section 5).
- **D3. Not placed on purpose:** the Communication tips (`channel`, `tags`, `status`), because Octalve's Broadcast has defects of its own that are fixed in their own task first (its message tags are never filled in: the broadcast body goes into the queue raw; and nothing consumes the queue at all, task 0054, so a "Queued" status would say something untrue); the Classes, Subjects and scheme headings (already printed); everything in Settings, Results, Finance, Programs, Forms and the portal (later PRs).

## 4. Work breakdown

- [x] Design (this file).
- [x] `InfoTip.tsx` (AlEemaan's final) and Octalve's registry, with a unit spec (the registry rules) and a browser spec on the real pages (SaaS-mode server, desktop and phone).
- [x] `info` on `SelectField` and `TextField`.
- [x] Six placements (section 5).
- [x] Docs: this file, the component catalogue, the tracker.
- [ ] Later, module by module: Settings, Results, Finance, Programs, Forms, Question bank, Users, Support, the portal; the Communication tips after their fixes; the walkthrough shows one icon and the final video is made after this ships.

## 5. What was placed (six tips), and what each was checked against

| Key | Where | Checked against |
| --- | --- | --- |
| `academics.sessions` | Beside the "Sessions" heading (Academic setup, Sessions & terms) | `lib/academics/rules.ts`: `CLOSE_DELAY_MS` is 24 hours and `FORCE_CLOSE_DELAY_MS` one minute; `CloseSessionDialog` ("Closing starts a 24-hour countdown... you can cancel", "Close sooner" asks for the password; "an administrator can reopen it later with a reason"); the statuses PLANNED, ACTIVE (shown as Open) and CLOSED |
| `academics.scales` | Beside the "Grade scales" heading (Grading) | `lib/academics/grading.ts` `newScaleVersion`: needs a locked scale, archives the old one, creates version + 1 with `isDefault: old.isDefault`; the panel's "In use, locked" pill and "Make a new version" button |
| `attendance.window` | Beside the "Date" label (Attendance) | `lib/attendance/rules.ts` `canEditAttendance`: ADMIN and CAMPUS_ADMIN any past date, TEACHING_STAFF within `MAX_TEACHER_EDIT_DAYS = 7`, a future date nobody, everyone else nothing |
| `promotion.passmark` | `TextField` "Pass mark (%)" (Promotion) | `lib/promotion/rules.ts` `evaluatePromotionRecommendation`: average at or above the mark promotes (graduates in the last class), below it repeats, and no published result at all repeats |
| `students.show` | `SelectField` "Show" (People, Students) | options Current, Archived, Everyone; `StudentDetail.tsx` shows a "Restore" button for an archived student |
| `staff.show` | `SelectField` "Show" (People, Staff) | options Current, Archived, Everyone; `StaffDetail.tsx` shows a "Restore" button for an archived staff member |

## 6. Build record and tests

**Static gates (on `claude/info-tips`, in the order tsc, lint, build, tests):** `tsc --noEmit` clean; eslint 0 errors and 0 warnings on every changed file; Prettier `--check` clean; `pnpm build` succeeded on lane 1; catalogue check 839 rows = 839 tracked files.

**Tests (lane 1, SaaS-mode server): 88 passed, 0 failed, 4 skipped, in 6.3 minutes.** The 4 skipped are the device-only tests of `info-tips.spec.ts` (the phone test on the desktop project, the three mouse and keyboard tests on the phone project). What ran: the new unit spec (5 tests: the registry rules), the new browser spec `tests/e2e/info-tips.spec.ts` on the desktop and phone projects (20 passed: each of the six icons in place, plus hover, keyboard, Escape with the mouse still on it, the phone tap, and axe in the dark and light theme with a tip open), and, as the proof that no accessible name changed, the EXISTING specs of every page touched: `academics` (20 passed), `attendance` (8), `people` (26) and `promotion-screens` (8), unchanged.

**The browser spec asserts, for each icon:** beside and not inside a heading, label, column head or button; named "More information"; 16 px; its popover says exactly the registry's words, is wired with `aria-expanded` and `aria-describedby`, stays inside the window; **the neighbouring control's box is identical before and after it opens; the page is no wider; and opening it does not scroll the page** (read after two animation frames).

**The component was copied after AlEemaan's runs had found and fixed its two placement bugs** (see AlEemaan's task 0054 and 0055 records), so none of them appeared here: the run passed first time. I did not run Octalve's spec against the earlier component versions, so these assertions are not proven in Octalve to catch those two bugs; they are the same assertions that did catch them in AlEemaan.

**Not run, and not claimed.** The whole suite; mutation passes (deferred to the end of PHASE 2, the maintainer's call); the Solo-mode server (these pages are the same component code; only the SaaS-mode server ran); "one at a time" and "Escape inside a dialog" (no Octalve page has two icons or one in a dialog yet; both are held by AlEemaan's spec of the same component); a real phone or screen reader (the icon's fixed name "More information" is the trade-off of AlEemaan's D3b); another browser than Chromium; the print path; the production site.
