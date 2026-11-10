# 0033: The logo on the signed-out screens goes back to the start page

- **Period / Focus:** 2026-11-10 (a small change to one shared layout, `AuthShell`; the same change as AlEemaan's task 0047)
- **Status:** Built; PR into `dev`
- **Priority:** Low
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-logo-home-link` / PR into `dev`
- **Started:** 2026-11-10

---

## 1. Objective

On every signed-out screen (`/login`, `/setup`, `/forgot-password`, `/reset-password`, `/accept-invite`, `/confirm-email`, `/verify/[token]`) the product logo (the cap icon and the name, in the brand panel on large screens and in the compact header on phones) is a link to `/`, the start page. Asked for by the maintainer on 2026-11-10 ("make the logos go back to landing page", for both products).

## 2. Context

- `AuthShell` (`src/components/auth/AuthShell.tsx`) draws the logo twice and neither is a link. The brand panel is `<aside aria-hidden="true">` as a whole, because it is decorative; **a link cannot live inside an `aria-hidden` region** (focusable but hidden from assistive technology: axe's `aria-hidden-focus`), so the hiding moves from the whole panel to its decorative parts (the grid pattern, the headline block, the copyright line) and the panel itself becomes `role="none"`.
- **What `/` is.** There is no marketing landing page: `/` is a router that never draws anything (`src/app/page.tsx`): a signed-in visitor goes to `/dashboard`; while the first-run setup of a solo install is unfinished, to `/setup`; anyone else to `/login`. So for a signed-out visitor the logo ends on the sign-in page, and **on `/login` itself it reloads the sign-in page**. It is useful from the other screens (reset, invitation, confirmation, verification) and is the right target for the day a landing page exists at `/`. Building one is a separate product decision.
- `tests/e2e/brand.spec.ts` pins the layout (the `aside` visible on desktop with its copy, hidden on a phone, the brand name visible inside `main` on a phone) and must keep passing unchanged.

## 3. Decisions

- **D1.** Both logos link to `/` (not `/login`).
- **D2.** On large screens the logo is before the form in the DOM, so it is the first tab stop; on phones the panel is `display: none`, so the compact header's link is the only one: never two at once.
- **D3.** The link's name is its visible text (the product name); the cap icon is decorative.
- **D4.** Focus ring white on the dark brand panel, the usual ring colour on the phone header; hover dims the logo slightly.

## 4. Work breakdown

- [x] `AuthShell`: both logos are links to `/`; the panel is `role="none"` with its decorative parts `aria-hidden`.
- [x] A browser spec (desktop and phone): one visible logo link to `/`, reachable by keyboard with a visible focus ring, from `/forgot-password` it takes the visitor back to the sign-in page; Axe in both themes.
- [x] Docs: this record, the component catalogue row, the tracker.

## 5. Not in this task

- A landing page at `/`. The logos of the signed-in shell (`AppShell`).

## 6. Build record and tests (2026-11-10)

**What changed.** `src/components/auth/AuthShell.tsx` only (the same edit in both products), plus `tests/e2e/auth-logo.spec.ts` (new), this record, the component catalogue row and the tracker. No other source file, no migration.

**Gates (order tsc, lint, build, tests).** tsc clean; eslint 0 errors; `pnpm build` OK; Prettier clean (`AuthShell.tsx` was clean at `dev`); catalogues in sync.

**Tests.** The new spec runs on the desktop and the phone project. The browser specs that visit the signed-out screens (`brand`, `accept-invite`, `account-self-service`, `csp`, `dev-inbox`, `setup-handoff`, `sign-in`, `password-reset`, `responsive-and-a11y`, `theme`, `two-step`, `users`, and in AlEemaan also `browser-security`) were run on the built change. The result of those runs is stated in the pull request, because they were still running when the branch was pushed (the maintainer asked for the push). **Not run:** the rest of the suite, the HTTPS project, anything against a hosted database; no failing-first run, since a link that was not there before has no old behaviour to fail.
