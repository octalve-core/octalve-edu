# 0044: The landing page component takes its words, language and direction as props

- **Period / Focus:** 2026-11-11 (a prerequisite for AlEemaan's landing page that talks about the school, and for its Arabic version; nothing visible changes in Octalve)
- **Status:** Built; PR into `dev`
- **Priority:** Medium
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-landing-props` / PR into `dev`
- **Started:** 2026-11-11

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

`LandingPage` (task 0041) is one component in two products and must stay byte-identical in both. Until now it read its words only from `brand.landing`, drew six cards that each need an icon, and wrote its own few English words ("Sign in", the footer's name and rights line, the theme button's name) in the code. AlEemaan's landing page is about one school, not about software, and it needs a version in Arabic (right to left). So the component learns to: draw any number of cards with or without an icon; take its words (and the English words of its own) as props; mark its language and direction; and offer a link to the same page in the other language. In Octalve, called with no props, it draws exactly what it drew.

## 2. Context

- `LandingPage()` takes no props and reads `brand.landing` and `brand.name`. The words in the code itself: "Sign in" (four places), the footer navigation's accessible name "Footer", and `© <year> <name>. All rights reserved.`. `ThemeToggle` (shared) says "Switch to light theme" / "Switch to dark theme" in English.
- Nothing in the component uses a physical direction (`ml-`, `pr-`, `text-left`, `right-0`): spacing is `gap`, `px`, `justify-between`, `mx-auto`, so a `dir="rtl"` wrapper mirrors it with no change to the styles.
- The root layout sets `<html lang="en">`. A wrapper with its own `lang` and `dir` overrides both for the page's content and for assistive technology.
- AlEemaan's copy of the component is byte-identical to Octalve's at `dev` (checked with `cmp`, 2026-11-11). `ThemeToggle` is shared the same way.

## 3. Decisions

- **D1. `LandingPage` takes optional props, every one with a default that reproduces today's page:** `copy` (the words; default `brand.landing`), `name` (default `brand.name`), `labels` (the component's own words; default English), `lang` and `dir` (default: not written), `switchTo` (the page in the other language; default: none).
- **D2. A card's icon is optional.** A card without an icon draws no icon box and its title takes the icon's place; a card with one is drawn exactly as before. The number of cards is not fixed (the unit test of Octalve's own words still holds six).
- **D3. `labels`** is `{ signIn, footerNav, rights(year, name), theme: { toLight, toDark } }`; `ENGLISH_LABELS` is the default and says exactly what the code said. `ThemeToggle` takes an optional `labels` (`{ toLight, toDark }`), default English; the landing page passes its own.
- **D4. `lang` and `dir` go on the page's outer element only when given.** With neither, React writes no attribute, so the markup is the same as before this task. (A unit test would be the natural proof, but a component cannot be rendered in the unit project: its loader replaces React's JSX runtime. So the default is held by a source-level unit test and by Octalve's existing browser specs of the page, which pass unchanged; the props themselves are exercised by AlEemaan's browser specs, tasks 0049 and 0050, which run the same file.)
- **D5. `switchTo`** is `{ href, label, lang }`: a quiet text link in the header, before the theme button, its label written in the OTHER language and marked with that language (`lang` and `hrefLang`), so a screen reader says it in the right voice. It is a plain link to another page: no script, nothing remembered.
- **D6. Nothing else changes:** no new colours, no new class names beyond the one for the switch link, no migration, no change to what `/` decides, no copy change in Octalve.
- **D7. The cards' grid follows their number (added in a follow-up PR, 2026-11-11).** AlEemaan's four branch cards in the three-column grid left one card alone on a second row. Four cards now sit two by two (`sm:grid-cols-2`); every other number keeps the grid the page always had (`sm:grid-cols-2 lg:grid-cols-3`), so Octalve's six cards are unchanged.

## 4. Work breakdown

- [x] Design (this file).
- [x] `LandingPage` props, optional icon, `ENGLISH_LABELS`; `ThemeToggle` optional labels.
- [x] A unit test of what can be held without rendering (no side-named class in the component; the English labels; every prop optional; `/` calls it with none; the language and direction written only when given).
- [x] The browser specs of tasks 0041 and 0042, the sign-in and logo specs and the browser-wide responsive spec pass unchanged.
- [x] Docs: components catalogue, HANDOVER, tracker, CLAUDE.md banner.

- [x] D7 in a follow-up PR: the cards' grid follows their number (a source-level unit test holds the rule; AlEemaan's browser spec measures the four cards two by two).

## 5. Not in this task

- AlEemaan's own words (task 0049 there: a landing page about the school) or its Arabic page (task 0050).
- A language chooser, language detection, or a remembered choice.
- Translating anything in Octalve.

## 6. Build record and tests

**What exists.** `LandingPage` takes `copy`, `name`, `labels`, `lang`, `dir`, `switchTo`, all optional, with `brand.landing`, `brand.name`, `ENGLISH_LABELS` and nothing as the defaults; `LandingCopy`, `LandingLabels`, `LandingProps` and `ENGLISH_LABELS` are exported; a card's `icon` is optional (no icon box, the title without the icon's top margin); `switchTo` is a quiet header link (`lang` and `hrefLang` set); `ThemeToggle` takes optional `labels`. No migration, no route, no copy change in Octalve.

**Gates (order tsc, lint, build, tests).** tsc clean; eslint clean on the changed files; `pnpm build` OK on the lane; Prettier clean; catalogues checked with `verify_catalogs.py` (827 files, 827 rows, none missing, extra, duplicate or broken).

**Tests.** New unit `landing-direction` (4 tests). Run on a clean build (lane 3): unit `landing-direction` and `landing-copy`, API `landing-router`, browser (desktop and phone) `landing-screens`, `auth-logo`, `sign-in` and the browser-wide `responsive-and-a11y` (the theme button is in the app shell too): **169 passed, 0 failed, 3 skipped** (11.6 minutes). The skips are phone-project skips that are in the specs already: `auth-logo` "the panel only exists from 1024 px up" and two `sign-in` keyboard tests ("tab order is a desktop concern").

**A first attempt that did not work, and what replaced it.** The first unit test rendered the component with `react-dom/server` (no props: the markup; with props: language, direction, labels, switch link, an iconless card). It aborted the whole run at collection: "Objects are not valid as a React child (found: object with keys {__pw_type, ...})". Playwright's loader replaces React's JSX runtime (`playwright/jsx-runtime.js`), so a component's JSX becomes Playwright's own descriptors, and a component cannot be rendered in this project. That test was deleted; nothing of it ran. The no-props markup was not compared character for character with the component at `dev` either (the same limit). What holds that "no props is the same page" instead: the diff (every default is the literal it replaced), the source-level unit test, and the unchanged browser specs of the page (`landing-screens`, 13 tests on each project, plus `auth-logo` and `sign-in`). The props themselves are not exercised by any Octalve page: they are exercised by AlEemaan's specs (its tasks 0049 and 0050), which run this same file.

**Mutation check (one unit-only round, no rebuild needed; applied in the lane copy, restored with `lanes.mjs sync` and checked identical with `cmp`).** Four mutations, four failing tests, one each: **M17** a `pl-4` added to a class: "it names no side" (received `" pl-"`); **M18** the English sign-in label changed to "Log in": "the component's own English words" (expected "Sign in", received "Log in"); **M19** a language written when none is given (`lang={lang ?? "en"}`): "the language and the direction are written only when given"; **M20** `/` calls the component with a prop: "every prop is optional and the component is called with none by `/`".

**Not run.** The whole unit and API projects; the HTTPS project; a character-for-character comparison of the default markup with `dev` (cannot run here, see above); the props in a browser in this repository (AlEemaan's specs do).

**Follow-up PR (D7, the grid).** Found when AlEemaan's four branch cards were photographed: four cards in the three-column grid left one alone on a second row. `COVERS_GRID` maps a count to its classes (four: `sm:grid-cols-2`), the default is the class string the page always had; Octalve's six cards render the same classes. Tests: the unit `landing-direction` (5 tests now) holds the rule in the source; AlEemaan's browser spec measures the four cards two by two. Run on a clean build (lane 3): unit `landing-direction` and `landing-copy`, API `landing-router`, browser (desktop and phone) `landing-screens` and `auth-logo`: **56 passed, 0 failed, 1 skipped** (`auth-logo` on the phone project, by design). One mutation (the four-card rule changed back to three by three, unit-only, restored and checked identical): exactly one of the five `landing-direction` tests fails, the new one ("the cards' grid follows their number").

**Left for the maintainer.** Nothing to run on any database.
