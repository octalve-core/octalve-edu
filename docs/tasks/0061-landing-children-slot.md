# 0061: The landing page component gets an optional slot for a product's own sections

- **Period / Focus:** 2026-11-13 (the same change as AlEemaan's task 0070, which needs it; the two products' `LandingPage.tsx` must stay byte-identical, task 0044)
- **Status:** Done
- **Priority:** Low (no visible change in Octalve Edu)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/landing-children-slot` / PR into `dev`
- **Started:** 2026-11-13

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

`LandingPage` accepts optional `children`, drawn after the page's own sections and before the closing band. Octalve Edu's `/` gives none, so its page is exactly what it was. AlEemaan's task 0070 uses the slot for the school's programs, what it stands for, and its contact details, which read data (the school profile) and so cannot be cards of words.

## 2. Decisions

- **D1. One optional prop, nothing else.** `children?: ReactNode` in `LandingProps`, destructured, and `{children}` between the optional "how it is run" section and the closing band. No default, no wrapper element: when it is not given, React draws nothing.
- **D2. The file is copied byte for byte** from AlEemaan's branch (`cmp` says identical). The signature of the function is one prop to a line now (Prettier, since another prop does not fit on the old line); `landing-direction.spec.ts` pinned the old one-line text with a regular expression, which now tolerates either layout, and a new test pins the slot (optional, before the closing band, not given by `/`).
- **D3. No new browser test here.** The slot is not used in Octalve Edu; AlEemaan's browser specs draw it (`landing-screens`, `landing-ar-screens`), and Octalve's own `landing-screens` spec, run after this change, shows its page is unchanged when nothing is given.

## 3. Work breakdown

- [x] Design (this file).
- [x] `LandingPage.tsx` copied from AlEemaan's task 0070 branch (`cmp`).
- [x] `landing-direction.spec.ts`: the signature pin tolerates a line break; a new test pins the slot.
- [x] Tracker.

## 4. Not in this task

- Anything that uses the slot in Octalve Edu.
- Mutation passes (deferred to the end of PHASE 2, the maintainer's call).

## 5. Build record and tests

Gates (order tsc, lint, build, tests): tsc clean; eslint clean on the component and the spec; Prettier clean on the changed files; `pnpm build` OK (lane 1); `LandingPage.tsx` is byte-identical with AlEemaan's copy (`cmp`, before the change too: they were identical on both `origin/dev`s).

Tests, lane 1 on a production build of this tree (setup, unit, browser on the desktop and on a phone): `landing-direction`, `landing-copy` and `landing-screens`: **38 passed, 0 failed**. Octalve's own `/` still draws exactly what it drew (its screens spec, which counts the sections, passes unchanged).

Unfixed-code run: the new slot test cannot run on the old component in a meaningful way, since the test is a text check; both of its patterns were evaluated on the old file and on the new one with `node`: the old component has neither `children?: ReactNode;` nor `{children}` before the closing band (both false), the new has both (both true). The loosened signature pattern exists only because Prettier now puts the props one to a line.

Not run: the whole suites; mutation passes (deferred to the end of PHASE 2). The slot is not used in Octalve Edu, so only AlEemaan's browser specs draw it.
