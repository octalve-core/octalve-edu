# 0042: The landing page's extra links come from the brand file

- **Period / Focus:** 2026-11-10 (a follow-up to task 0041, made so that AlEemaan's landing page can reuse the component as it is)
- **Status:** Built; PR into `dev`
- **Priority:** Low
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-landing-links` / PR into `dev`
- **Started:** 2026-11-10

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

The two products' components are meant to stay code-identical, with every product-specific word in `src/lib/brand.ts`. The landing page of task 0041 named one public page in its own code (`/verify`, "Check a report card"), which is Octalve's. AlEemaan has no such page (its public pages are the parent and pupil portal and a check of one mark by its token), so the link must be the brand's to name.

## 2. Context

- `LandingPage` (task 0041) draws "Sign in" in the header, the hero, the closing band and the footer, and one more link, "Check a report card", in the hero and the footer.
- AlEemaan's equivalent public entry is `/portal` ("Parent and pupil portal"). It has no `/verify` page without a code.

## 3. Decisions

- **D1.** `brand.landing.links` is a list of `{ label, href }`: the public pages worth a link besides sign-in, each a path on this site. The first is the hero's quiet button; every one is in the footer. Sign-in is always offered and is not in the list. Octalve's list is the one link it had: "Check a report card", `/verify`.
- **D2.** Nothing the visitor sees changes in Octalve: the same two links, in the same places, with the same words and addresses.
- **D3.** The unit test of the words also holds the links: paths on this site (never an address elsewhere), no repeats, never `/login`, a name that says where it goes, and none that offers a sign-up, registration, trial or demo.

## 4. Work breakdown

- [x] `brand.landing.links`; `LandingPage` reads it (hero and footer).
- [x] The unit test holds the links; the API and screen specs of task 0041 are unchanged and must still pass.
- [x] Docs: this file, tracker, catalogues, HANDOVER.

## 5. Not in this task

- A sign-up link (there is no sign-up page).
- Anything that changes what the page looks like or says.

## 6. Build record and tests

**What changed.** `src/lib/brand.ts` (`landing.links`), `src/components/landing/LandingPage.tsx` (the hero's quiet button and the footer's list come from it), `tests/unit/landing-copy.spec.ts` (the links). No migration, no API, nothing visible changes.

**Deployment.** Nothing to run.

**Tests (one lane, one worker, the production build).** Unit `landing-copy` (one test added: the links are paths on this site, no repeats, never `/login`, no offer of a sign-up; and the "no offer" test now reads the link labels too). The API spec `landing-router` and the screens spec `landing-screens` of task 0041 are unchanged in what they pin (the same two links, their words and their addresses, in the hero and the footer); the screens spec now reads the link from `brand.landing.links` instead of repeating its words, so the same file serves both products. **One fix to my own test:** the keyboard test read the outline width in the very instant of the key press, and under reduced motion every property "transitions" over 0.01 ms, so a read that early can see the width from before the ring (it did, on AlEemaan's build; it had passed here by luck of timing). It now waits for the element's running transitions to settle before reading.
- **Mutation check.** In a copy, the brand's link list was emptied and the footer's list made to skip its first entry; after a rebuild 8 tests failed (the API spec of links, the way-in test, the link-count test and the keyboard-order test on both projects, and the unit test of the links); the copy was restored from the worktree, checked identical file by file, and rebuilt. (A first try that emptied the list with `[]` did not compile, which is the type checker catching it; the change was redone so that it compiles.)
- **Run on the final build:** `landing-copy`, `landing-router`, `landing-screens`, `auth-logo` and `sign-in`: **109 passed, 0 failed, 3 skipped** (the existing phone-only skips); and, after the keyboard-test fix, `landing-screens` again: 23 passed.
- **Not run:** the whole unit and API projects (nothing outside the landing page, its brand words and one spec changed, and nothing else reads `brand.landing`); the HTTPS project; anything against a hosted database.

**Left for the maintainer.** Nothing.
