# 0026: The sidebar in sections, collapsible to icons, with the person pinned at the foot

- **Period / Focus:** requested 2026-11-03 by the maintainer, for both repos; this is the port of AlEemaan's task 0042 (its design document is the source: `docs/tasks/0042-sidebar-sections.md` there)
- **Status:** Built 2026-11-03; test results in section 7
- **Priority:** High (Octalve's walkthrough, when it is run, films the sidebar)
- **Assignee:** next AI / maintainer
- **Target Branch / PR:** one branch (`claude/sidebar-sections`) and one PR off `dev`

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
The desktop sidebar is one flat list. It becomes **sections with sub-items**, each section foldable; the **whole sidebar folds to a rail of icons** that opens by itself while the pointer is over an icon (hovering the toggle does nothing); and the **signed-in person stays pinned at the foot** however short the list is. Nothing about who may see what changes: the list is still `navFor(school, platform)`, filtered by the role in the school in view, and the pages and APIs still decide access.

## 2. What is the same as AlEemaan, and what is not
Same (see AlEemaan's 0042 for the reasoning): the rules (list derived from one place; a section of one entry is a plain link; the page you are on is never hidden; hover is a courtesy and focus does the same; no layout shift from hover; preferences are cookies read on the server and whitelist-parsed; both themes, phone untouched, reduced motion honoured); the frame (`SidebarProvider` as the shell's root element with `data-sidebar`, `SidebarFrame` in two boxes, 64 px rail, 120 ms close delay, touch never opens it, Escape and leaving close it); the toggle (a round 28 px brand-coloured arrow on the right edge near the top, left to fold and right to open, `z-30`); the cookies (`sidebar`, `sidebar-sections`; `src/lib/shell-prefs.ts` is the same file); the More sheet's section headings; a rule above a plain link that follows a section.

Different, on purpose:
1. **The list is role-based per school**, not flag-based: `navFor(school, platform)`. Each entry carries its `section`.
2. **The school switcher.** The sidebar has a "School" block under the brand (plain text with one school, a disclosure with several). In the rail it becomes a building icon **of the same height**, so the navigation below does not move when the rail opens (a test measures it with one school and with several); the real switcher shows once the sidebar is open, and the icon is a hover trigger like the navigation and the person.
3. **The section is called "Administration", not "School"**, because the switcher's label above the navigation already says "School" (two stacked "School" labels read as a mistake, and an existing test counts buttons named /School/).
4. **Platform** is a section of one entry, which is how the link ends up last, as a plain link with a rule above it.

## 3. Sections (Octalve)
| Section | Entries (in list order) |
| --- | --- |
| (none) | Overview, or "Your schools" outside a school; "My work" (a pupil); "My children" (a guardian) |
| Administration | Academics, People, Communication, Users, Settings (a school administrator); the same without Settings (a campus administrator); Academics and People (staff) |
| Learning | Question bank, Forms |
| (Platform, alone) | Platform, last, for a platform administrator |

A pupil and a guardian therefore see no section at all. The phone's tab bar is unchanged (the first four entries in list order); the More sheet groups the rest under the same headings.

## 4. Work Breakdown
- [x] `nav.ts`: `section` on `NavItem`, `SECTIONS`, `groupNav`, `sectionOfPath`; the order of `navFor` unchanged
- [x] `src/lib/shell-prefs.ts` (the same as AlEemaan's) and the unit tests
- [x] `ChevronLeftIcon` (`ChevronRightIcon` already existed)
- [x] `SidebarFrame` (slots `top` and `foot`), `SidebarNav`, `SidebarPerson`, `SchoolSwitcher` (rail variant), `BrandMark`, `AppShell`, `(app)/layout.tsx` (reads the cookies), `MobileNav` (headings)
- [x] Tests: unit (`tests/unit/shell-nav.spec.ts`: groupNav for every role, sectionOfPath, the cookie parsers); e2e (`tests/e2e/shell.spec.ts`: sections, folding and remembering, a hand-edited cookie, the section of the current page opens, a pupil with no sections, a platform administrator's Platform link, the rail, the arrow on the edge and clear of the brand mark, hover and focus and touch, nothing jumps (one school and several), the switcher after opening, the pinned person (short list, all folded, rail, short window), axe and overflow in both themes for open, rail and peek, the phone sheet's headings)
- [x] Docs: this file, `current-tasks.md`, `HANDOVER.md`, `octalve_edu_progress.md`, the component and function catalogs, the `CLAUDE.md` banner

## 5. Not in this task
A resizable sidebar, favourites, search in the sidebar; hover-to-open on a touch device (a tablet taps the arrow); a scroll hint for a list longer than the window (folding sections shortens it).

## 6. Octalve-only walkthrough
Octalve has no walkthrough matrix yet. When its walkthrough is planned, the shell rows must include: sections folding, the rail and the hover, the pinned person, and the school switcher in the rail.

## 7. Results
Run on 2026-11-03 against a production build, lane 3 (own ports, database `octalve_edu_lane3_test`), desktop and phone projects:
- **The shell specs** (`tests/unit/shell-nav.spec.ts`: 15 new unit tests; `tests/e2e/shell.spec.ts`: 26 new browser test cases, 20 written out and 6 generated, two themes by open, rail and peek): 75 passed and 1 failed in the first run; the failure was a mistake in my test (it measured a section heading while the 200 ms width change was still running, 80 px instead of 48), fixed by waiting for the rail width first; the group passes (19 of 19), and the rest of the file passed in the first run.
- **The whole unit and browser suite** (`--project=unit --project=e2e-desktop --project=e2e-mobile`, run after the fix, machine at load 6 to 12): **1374 passed, 2 failed, 51 skipped.** Both failures are in `tests/e2e/sign-in.spec.ts`, screens that do not have the sidebar:
  - "a normal (non-cache) pageshow does nothing" (desktop): the test signs in, deletes the session at once and expects the page to stay; the page was on `/login`. Run alone five times on this branch it failed 2 of 5; run on a clean build of `dev` (`ae06fc9`, a separate worktree, removed afterwards) under the same load it failed 2 of 6. So it fails without this change and is not caused by it; the cause was not chased further (it is a race between the deleted session and what the page requests next).
  - "the paused banner's live text isn't spammed at screen readers every second" (phone): the page said "Can't reach the server" on the fifth wrong password (the overloaded machine); run alone five times it passed every time.
- **Found by looking at the screenshots and by the tests while building, fixed:** a section called "School" would have collided with the school switcher's own "School" label and with an existing test that counts buttons named /School/ (renamed "Administration"); a lone link after a section read as part of that section (a rule above it now); the toggle arrow touched the brand mark in the rail (now 28 px and 2 px further out, and a test keeps it clear).
- **Not run:** a failing-first run of the new tests on an unfixed `dev` (they test new behaviour, so they cannot pass there); the touch path was tested with a synthetic touch `pointerover`, not on a real touch screen; no real screen reader was used; mutation passes (deferred to the end of Phase 2).
