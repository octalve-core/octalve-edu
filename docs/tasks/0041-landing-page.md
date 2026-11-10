# 0041: The landing page — what a signed-out visitor sees at `/`

- **Period / Focus:** 2026-11-10 (public pages; the `/` row of `docs/pages/public.md` says "Router that never renders UI")
- **Status:** Built; PR into `dev`
- **Priority:** Medium
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-landing-page` / PR into `dev`
- **Started:** 2026-11-10

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

A person who opens the product's address and is not signed in sees a real page that says what Octalve Edu is, what it covers, who it is for and how to get in, instead of being thrown at a sign-in form. A signed-in person still lands on their dashboard and a fresh Solo install still lands on its set-up wizard.

## 2. Context

- `src/app/page.tsx` is a pure router: signed in goes to `/dashboard`; Solo with a set-up known to be incomplete goes to `/setup`; everyone else goes to `/login`. It renders nothing.
- Every signed-out screen (`AuthShell`) has the logo linking to `/`, "the start page". Today that is the sign-in page by way of the redirect. Four specs pin the redirect: `sign-in.spec.ts` (two places), `auth-logo.spec.ts` (the logo from another signed-out screen) and `setup-handoff.spec.ts` (`/` to `/setup`, which stays true).
- Brand strings live in `src/lib/brand.ts` and colours in `src/app/brand.css`: the only two per-repo brand files, so the components stay code-identical with AlEemaan's. AlEemaan gets its own landing page as a separate task and must be able to reuse the component with its own words.
- Public pages that exist today: `/login` and its recovery pages, `/verify` (task 0038: check the code printed on a report card), `/offline`, `/video-guide`, `/q/...`. There is no public sign-up page, so the page must not offer one.

## 3. Decisions

- **D1. The order of the router does not change; only its last line does.** Signed in: `/dashboard`. Solo and set-up known to be incomplete: `/setup`. Otherwise (SaaS, a finished Solo, or a set-up state that could not be read): the landing page, not `/login`. The page is still `force-dynamic` (it reads the session cookie) and sets nothing.
- **D2. Only what is built.** Every sentence on the page names something the product does today, and the list of claims is kept in section 3a with the screen each one rests on, so a reviewer can check it. Nothing about sign-up, pricing, free trials, integrations, testimonials, counts of schools or any number at all.
- **D3. The words live in `brand.landing`, the page in a shared component.** `LandingPage` (`src/components/landing/`) is a server component that reads `brand.landing`: headline, lead, the six things it covers, the people it is for, and an OPTIONAL "how it is run" pair (Octalve has two: managed or on your own server; AlEemaan has one school and leaves it out, and the section is simply not drawn). AlEemaan's task copies the component and writes its own `brand.landing`.
- **D4. What is on the page.** A header (logo, theme switch, "Sign in"); the hero (eyebrow, one `h1`, a lead, "Sign in" as the one filled button and "Check a report card" as the quiet one); "What it covers" (six short items); "Made for the people in a school" (four roles, one sentence each); "Managed or on your own server" (two short items); a closing band in the deep brand colour with "Sign in"; a footer with the two links and the copyright. No images, no carousel, no animation, no third-party script or font beyond what the app already loads, no cookie or storage written.
- **D5. Two links, both real.** "Sign in" goes to `/login`; "Check a report card" goes to `/verify` (task 0038). Nothing else links out; there is no sign-up link because there is no sign-up page.
- **D6. Accessible and responsive by construction, and tested.** One `h1`; `h2` for each section; the landmarks `header`, `main`, `footer`; every link has a name that says where it goes and a visible focus ring; icons are decorative (`aria-hidden`); text and controls pass Axe (WCAG 2.2 A/AA) in the dark AND the light theme; at 320 px wide nothing overflows sideways; the order of reading is the order on the screen; the page makes sense with the colour removed (the sections are headings and lists, not colour alone).
- **D7. The logo keeps pointing at `/`.** On a signed-out screen it now takes a visitor to the landing page, whose "Sign in" is one press away; `AuthShell`'s comment says so. For a signed-in person `/` is still the dashboard.
- **D8. Tests that pinned the redirect say what is true now.** `sign-in.spec.ts` ("a signed-out visitor is sent to /login from /dashboard and /"): `/dashboard` still goes to `/login`; `/` shows the landing page and nothing protected. `auth-logo.spec.ts`: the logo from another signed-out screen leads to the landing page. `setup-handoff.spec.ts` stays as it is (`/` to `/setup`).
- **D9. Title and description.** The tab says "Octalve Edu: school management" (an absolute title, since the root template would repeat the name) with a description of one sentence. The page is open to search engines (unlike the public questionnaire and the verification pages, there is nothing in it to protect).

### 3a. Each claim and what it rests on

| On the page | Built in |
| --- | --- |
| Students and staff records, guardians linked to children, classes and arms in each campus | People and Academics screens (tasks 0001, 0009) |
| Teachers take the roll for their own classes; administrators see the whole school | Attendance (task 0002) |
| Marks entered by teachers or imported from a spreadsheet; approval before publishing | Results and publishing (task 0003; approval states `DRAFT`, `SUBMITTED`, `APPROVED`, `PUBLISHED`) and the import (task 0039) |
| Printable PDF report cards with remarks and a code per mark that anyone can check | Tasks 0036 (remarks), 0038 (PDF and `/verify`) |
| Invoices for each term and payments; hold a report card back until fees that are due are paid | Finance (tasks 0004, 0029), the gate (task 0037) |
| Promote, repeat or graduate a whole class; undo a roll that was a mistake | Promotion (tasks 0031, 0035, 0040) |
| Pupils and parents see published results and report cards | Results and report cards for the pupil and parent roles (tasks 0003, 0037: held back only when the school asks) |
| Each person sees only what their role needs; several campuses | Role scopes and the campus administrator (tasks 0009, 0020) |
| Managed: hosted, each school's data kept apart; on your own server: one school, your database | `DEPLOYMENT_MODE` (`saas` or `solo`), row-level security by school |

## 4. Work breakdown

- [x] Design (this file).
- [x] `brand.landing` (the words) and `LandingPage` (the page, a server component); `page.tsx` renders it instead of redirecting a signed-out visitor; metadata.
- [x] `AuthShell` comment; `docs/pages/public.md` (the `/` row and the section intro), catalogues, tracker, HANDOVER, CLAUDE.md banner.
- [x] Tests: unit (the words and the links), API (what `/` answers: signed out 200 with the page and no redirect and no `Set-Cookie`; signed in a redirect to `/dashboard`; the Solo server with an unfinished set-up a redirect to `/setup`), screens (desktop and phone; both themes; Axe; no overflow; keyboard; the two links; signed in and out), the four specs that pinned the redirect, mutation check, whole unit and API projects and the related screens.

## 5. Not in this task

- A sign-up page or a "request a demo" form (there is none to link to).
- Pricing, plans, screenshots, a features page, a blog, translations.
- AlEemaan's landing page (a separate task in that repository, using this component).
- Changing `/login`, `/setup` or what they redirect to.

## 6. Build record and tests (2026-11-10)

**What changed.** No migration, no API, no data. `src/app/page.tsx` renders the landing page for a signed-out visitor instead of redirecting to `/login` (signed in to `/dashboard` and a fresh Solo install to `/setup` are untouched and still come first); it has its own absolute tab title and description and is open to search engines. New: `src/components/landing/LandingPage.tsx` (a server component: header with the name, theme switch and "Sign in"; the hero with "Sign in" and "Check a report card"; six things it covers; four kinds of people; the two ways to run it; a closing band; a footer) and `brand.landing` in `src/lib/brand.ts` (all the words, with `howRun` optional for AlEemaan). `AuthShell`'s comment now says the logo leads to the landing page. Docs: the `/` row and the catalogues.

**Deployment.** Nothing to run: no migration. The page needs no setting; its two links are `/login` and `/verify`.

**Gates (order tsc, lint, build, tests).** tsc clean; eslint 0 errors on every changed file; `pnpm build` OK (`/` stays dynamic); Prettier clean on every file changed; catalogues in sync (825/825).

**Tests (one lane, one worker, the production build).**
- Unit `landing-copy` (new): no sign-up, price, trial, demo or free plan in the words; no figure (no digit); every text trimmed, non-empty, no doubled spaces or placeholder; every item a sentence; six things it covers each with its own icon and title, four kinds of people, two ways to run it; a title of at most 60 characters and a description of one sentence of at most 160; the headline is the sign-in panel's.
- API `landing-router` (new, over real HTTP with no cookie jar): signed out, on the SaaS server and on a finished Solo install, `/` is a 200 page with its one `h1` and not a redirect, sets no cookie, writes no session and holds no school address; the only links are `/login` and `/verify` and both answer 200; the tab title and description are the page's own and there is no `noindex`; forged or empty session cookies are a signed-out visitor; a signed-in person is redirected to `/dashboard`; a Solo install with set-up unfinished is redirected to `/setup` and a finished one gets the page; the SaaS server never sends a visitor to the wizard whatever the flag says.
- Screens `landing-screens` (11 tests, desktop and phone, new): the title, one `h1`, the headings in order and the header, main and footer landmarks; the list items and their words; the way in and the check page each lead to a page that works; "Sign in" four times and "Check a report card" twice, all to the right address; the theme switch and its cookie; the keyboard goes through the controls in order and each shows a focus ring of at least 2 px; Axe (WCAG 2.2 A/AA) and horizontal overflow in both themes at the default width, at 320 px and at 320 px with text a third larger; the text on the deep brand band is measured at 4.5:1 or better (see below); the page and its links work with JavaScript off; a signed-in person who opens `/` never sees it, and `/dashboard` and a school page still send a signed-out visitor to `/login`.
- Changed: `sign-in.spec` ("a signed-out visitor is sent to /login from /dashboard, is shown the landing page at /") and `auth-logo.spec` (the logo from another signed-out screen leads to the landing page, one press from sign-in). `setup-handoff.spec` (`/` to `/setup`) is unchanged and passed.
- **Mutation check, in three rounds.** *Round 1*, eleven rules broken together in one build: a signed-in person not routed to the dashboard; a fresh Solo install not routed to the wizard; a dead sign-in link in the hero; no `main` landmark; a skipped heading level; the footer's check link gone; copy that offers "sign up free"; a low-contrast closing sentence; a fixed width that overflows a phone; no focus ring; `noindex`. 21 tests failed, and eight of the eleven rules have a test that failed for it by name (signed in, the wizard, the links, the skipped heading level, the footer count, the copy, the overflow at 320 px read from the failure message, `noindex`). The three exceptions: the low contrast **was not caught**, because Axe cannot judge text laid over the band's patterned background (it reports "needs review", not a violation); the missing focus ring was masked by the footer change in the same test; and the missing `main` landmark shares its test with the skipped heading level, which fails first, so it was not shown on its own (the landmark assertion is a plain count of one). *Round 2* (the finding): a measured contrast test was added (the text's colour and opacity laid over the band's colour, by the WCAG formula, for the heading, the sentence and the link, in both themes); with only the low contrast and the missing focus ring broken, exactly those two tests failed (the contrast test and the keyboard test) and the other 19 passed. *Round 3*: with only the old redirect to `/login` restored, 22 tests failed (API, screens, the logo spec). The copy was restored from the worktree, checked identical file by file, and rebuilt.
- **Regression:** the whole `unit` and `api` projects and the related screens (`landing-screens`, `auth-logo`, `sign-in`, `setup-handoff`, `theme`, `front-door`, `responsive-and-a11y`, `shell`) on the final build: **3,056 passed, 0 failed, 50 skipped** (the skips are the existing project-scoped tests: eight of the shell's phone tab-bar tests on the desktop project, and on the phone project the shell's desktop sidebar tests, two sign-in keyboard tests, one theme keyboard test and the logo spec's decorative-panel test; none is in a spec of this task).
- **What the work found.** One real gap in my own tests (the contrast above, now measured). The page's policy refuses inline style text, so the "larger text" step sets the font size through the style object instead of a style tag (the policy working as intended). Nothing in the existing code needed changing beyond the two specs that pinned the redirect.
- **Not run:** the HTTPS project (it signs out to `/login`, not `/`, so it does not touch this); the rest of the browser suite; a real screen reader and a real phone (the checks are Axe, keyboard order, focus rings, the 320 px reflow and a script-free read); anything against a hosted database.

**Left for the maintainer.** The words are a product and marketing decision: every claim is listed in section 3a with the screen it rests on, nothing on the page is a promise the product does not keep today, and there is no sign-up, price or trial because there is no sign-up page; when one exists, the hero is the place for its link (and `brand.landing` for its words). A Solo install that is finished also shows the "Managed, or on your own server" section; if that reads wrongly on a school's own server, `howRun` can be left out of `brand.landing` and the section disappears. `/video-guide` is not linked because it depends on the media files being present. AlEemaan's landing page is a separate task in that repository and reuses the component with its own words.
