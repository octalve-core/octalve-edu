# Octalve Edu — Development Progress Tracker

Last Updated: 2026-10-20

Companion to `docs/development-history/domain-implementation-plan.md` (the step-by-step build
plan), `docs/development-history/phases/*.md` (one detailed doc per completed phase), and
`docs/PRD.md` (requirements + every architecture decision, with reasoning, synced from the
canonical Claude Doc). Mirrors the structure of `TheNiche`'s own
`docs/development-history/theniche_progress.md` — this file tracks _what's actually built_, checked
against the real repo, not what a plan says should exist.

---

## Overall Status Summary

- **Planning & Architecture**: 100% — `docs/PRD.md` (14 sections + a Security & Compliance Audit
  tab in the canonical Claude Doc, cross-checked against a second independently-produced audit) and
  this implementation plan are written and cross-referenced. `docs/PRD.md` §7's tenant-trust
  boundary, §14's Settings model, and the payment-integrity fixes all trace to specific audit
  findings, cited inline in the plan.
- **Phase 0 — Foundation**: **100% Complete.** Next.js 16 + TypeScript + Tailwind scaffold,
  Prisma 6.19 + PostgreSQL with Auth.js's tables plus `Tenant`/`Campus`/`TenantMembership`,
  `tier-manifest.json` skeleton, local dev `docker-compose.yml`, git initialized. `pnpm build`
  clean, first migration applied against a real local Postgres, `pnpm dev` verified serving
  `HTTP 200`. See `docs/development-history/phases/phase-0-foundation.md` for the full record,
  including the one real judgment call (Prisma 8 rc → 6.19.3 downgrade, matching the sibling `ims`
  project).
- **Phase 0.5 — Auth, RLS & Shared API Infrastructure**: **100% Complete.** All sub-phases (0.5.0–0.5.F, 0.5.2 tenant trust boundary, 0.5.2-RLS, 0.5.2-H app shell, 0.5.3 API infrastructure, 0.5.4 users and invitations) built, verified with automated test suites under `app_user` role, and merged.
- **Phase 1 — MVP: Core SIS + Finance**: **100% Complete.** All 8 milestones built, verified, hardened, and gated across Phase 1.0 (Foundations), 1.1 (Academic Structure), 1.2 (People & Enrolment), 1.3 (Attendance), 1.4 (Results & Grading), 1.5 (Finance & Invoicing with dual-mode Paystack), 1.6 (Timetable & Announcements), 1.7 (Settings & Step-up MFA), and 1.8 (End-to-End Hardening, Cross-Tenant IDOR Matrix, Lifecycle Walk, Finance Adversarial Suite, PostgreSQL EXPLAIN Query Plan Sanity, and Phase Gate). Full repository gates clean. Records: `phases/phase-1.*.md`.
- **Campus administrators and a platform administrator (task 0009, ADR 0016)**: **built, verified and landed in `dev` (PR #7; follow-ups in tasks 0010 and 0011, PRs #8 and #14).** Slices A (migrations, `canAdminister`), B1–B4 (people; academics, attendance, announcements, timetable; invoices and manual payment; members and invitations), C (suspension, `pnpm platform-admin:make`, the platform API and page), D (route-role guard, ADR, docs). Found and fixed on the way: ISS-0014 (every invoice listed to any parent), the role being assignable without a campus; ISS-0013 (teacher attendance read scope) was fixed in task 0010 (F3). Mutation pass NOT RUN — pending, end of Phase 2.
- **Phase 2 — Communication**: **built and released** (task 0012, PR #18, 2026-10-16): templates, a queue on Redis and the email and SMS gateways. The catalogs (`docs/functions/school-app.md`) say, file by file, what each route and screen does today, including what is built and not yet wired.
- **Phase 3 — Quick tools and PWA**: **built and released** (task 0013, PR #19, 2026-10-16): the quick-tools dock and the installable app with an offline payment queue.
- **Phase 4 — LMS and assignments**: **built and released** (task 0014, PR #20, 2026-10-16). The operations modules planned for a later phase (HR and payroll, library, transport, inventory, NEMIS reporting, admissions) are specified in `docs/tasks/0016-phase-4-operations-and-admissions-blueprint.md` and not built; only the extended staff and guardian fields landed (PRs #27 and #28).
- **Phase 5 — Expansion**: **built and released** (task 0015, PR #21, 2026-10-18): higher-ed credit units, custom domains and vocational certificates. Tagged `v1.0.0` and `v1.0.1` (PRs #22, #23, #25, #26). The phase numbers here follow the task register (`docs/tasks/current-tasks.md`); earlier versions of this file numbered them differently and showed all four as not started.
- **Review fixes (task 0017)**: **merged into `dev` on 2026-10-20 as PRs #36 to #43 (six fixes, then two source-character changes); not yet promoted to `master` or `prod`.** Request bodies are read no further than the cap; a refused timetable batch changes nothing and one lesson's start and end are checked together; LMS work belongs to the signed-in student and reads follow the viewer; results are edited only while DRAFT and a refused request writes nothing; a roll names only the arm's students; a report card is read within the reader's campus and, for a teacher, their own arms. Every new test failed on the unfixed build first. Record: `docs/tasks/0017-review-fixes-access-atomicity-and-request-bodies.md`.

---

## What's real vs. what's designed-but-unbuilt

> **Note, 2026-10-20:** the bullets below were written on 2026-09-30, during Phase 0.5, and describe
> that moment (they say, for example, that no RLS policy exists yet). They are kept as history. The
> Overall Status Summary above and the code catalogs (`docs/pages`, `docs/components`,
> `docs/functions`) say what is built today.

This section exists specifically to prevent the trap `TheNiche`'s own plan names: a schema decision
that "sounds right" getting treated as done because it's written down somewhere. As of this
update:

- **Two migrations beyond Phase 0 exist, both applied against a real local Postgres.**
  `20260927223904_add_setup_wizard` (`User.passwordHash`, `SystemSettings`, `AuditLog`) and — on the
  in-progress auth branch, 2026-09-30 — `20260930121043_rebuild_auth_hashed_sessions` (hashed
  `Session.tokenHash`, two-level expiry, dropped `Account`, DB-level lowercase-email `CHECK`, the
  latter verified by a live negative insert). Everything in Phase 0.5.2 onward is still Prisma syntax
  inside a markdown file, not validated against a real database.
- **No RLS policy exists yet**, including on the Phase 0 tables (`Campus`, `TenantMembership`)
  that already exist — Phase 0's own completion doc says this explicitly, so it doesn't get lost.
- **Authentication works end-to-end and is verified — on the in-progress branch, not yet on
  `master`:** sign-in, session, `GET /api/v1/auth/me`, sign-out, stale/expired/revoked-session
  rejection, layered rate limiting, `withAuth`, and the `/login`, `/dashboard`, `/setup` screens are
  covered by an automated suite (see "Auth build" below). On `master` (what `octalve-core/octalve-edu`
  shows today) none of it exists until the maintainer merges the PR. Auth.js is not used anywhere and is
  not a dependency.
- **A real test suite exists** (`tests/`, `playwright.config.ts`, `pnpm test`) — on the same branch.
  Before it, the only verification in the repo was hand-run curl against a dev server.
- **Still unbuilt and undesigned-in-code:** TOTP MFA, password reset, the tenant-trust boundary and every
  RLS policy, the shared API helpers (§0.5.3), and all of Phase 1+.

## Recent changes (2026-09-28)

- **Prisma schema is now multi-file**: `prisma/schema.prisma` split into
  `prisma/schema/{schema,auth,tenancy,setup}.prisma` (Prisma's "schema folder" mode, stable since
  6.7, no preview flag needed on the installed 6.19.3), with a new `prisma.config.ts` pointing the
  CLI at the folder — same convention already used by the sibling `ims` and `AlEemaan` projects.
  `pnpm prisma validate`, `pnpm prisma generate`, and `pnpm build` all verified clean against the
  split. Every future phase's models get their own file (`sis.prisma`, `finance.prisma`,
  `comms.prisma`, `lms.prisma` — already named in the plan doc's schema sketches) rather than one
  file growing indefinitely.
- **Cross-project finding folded into §0.5.1's design**: AlEemaan (sibling project, same stack)
  discovered building its own identical Phase 0.5.1 that Auth.js v5 refuses a `Credentials` provider
  combined with `session.strategy: "database"` outright — exactly the combination
  `domain-implementation-plan.md`'s §0.5.1 currently describes wiring. A warning citing AlEemaan's
  fix (hand-rolled login/logout against the `Session` table instead of Auth.js's own Credentials
  flow) is now inline in that section, so this doesn't get rediscovered live the same way.

## Auth hardening pass (2026-09-29)

`domain-implementation-plan.md` §0.5.1 now has a full route-level design for the hand-rolled
login/logout (guard order, cookie shape) instead of just "expect to do the same as AlEemaan" —
written to the same precision as AlEemaan's shipped version, plus fixes found by auditing that
version after the fact rather than repeating them here:

- A constant-time response (AlEemaan's version has a real timing side-channel — skips
  `bcrypt.compare` entirely on a missing user, so "no such account" answers faster than "wrong
  password" even with identical status codes).
- A `lib/auth/csrf.ts` call on both routes (the helper already exists in this repo from the setup
  wizard, but nothing said the hand-rolled login has to use it — easy to forget since Auth.js's own
  Credentials flow would have handled this invisibly).
- A fresh, server-generated 256-bit session token on every login (session-fixation defense, named
  explicitly rather than left implicit).
- Email normalization (`trim().toLowerCase()`) applied everywhere `User.email` is read or written,
  not just at login.
- The session lifetime (30 days) as one shared constant, not duplicated separately in `src/auth.ts`
  and the login route the way AlEemaan currently has it (a real drift risk in AlEemaan worth not
  repeating).
- Rate-limit bucket records failed attempts only, not every request — stated explicitly since
  §0.5.3 describes the limiter as generic middleware, vague enough to get built wrong.

§0.5.3's rate limiter is now also specified to key on `ip + email` combined, not IP alone, fixing a
shared-IP lockout problem in AlEemaan's current in-memory limiter.

## Second auth hardening pass (2026-09-30) — two-AI review

`domain-implementation-plan.md` §0.5.1–0.5.3 rewritten against a full two-AI cross-review of both
this plan and AlEemaan's shipped auth code (record: `docs/auth-review-2026-09-29.md`). Sixteen
findings incorporated, three of them changing real design decisions rather than just adding detail:
`SET LOCAL` string interpolation replaced with parameterized `set_config()` (the RLS safety net had
its own SQL-injection surface); RLS role setup made explicit (`app_user` with `NOBYPASSRLS` +
`FORCE ROW LEVEL SECURITY` — RLS policies are otherwise inert against the table-owner role Prisma
migrations typically use, meaning CI's own negative tests could pass while protecting nothing); and
`@upstash/ratelimit` identified as incompatible with the plain self-hosted Redis container
`docker-compose.yml` actually provisions. Also verified independently (web search, not assumed):
Better Auth's team now maintains Auth.js (took over September 2025; Vercel acquired Better Auth July
2026) — Auth.js is maintenance-mode only now, which reopened whether to evaluate Better Auth for this
phase specifically.

## Better Auth spike — resolved 2026-09-30: hand-roll, mirroring AlEemaan

Ran the spike rather than guess. Better Auth fits well on database sessions, TOTP MFA, and session
listing/revocation — but its **hashed-session-token-at-rest** support (the one genuinely
non-negotiable requirement here) is **not shipped**, only an unmerged draft PR
(better-auth/better-auth#11444). Its `organization`/`teams` plugin also doesn't map as cleanly onto
`Tenant`→`Campus` as the schema already built here. Decision: hand-roll §0.5.1, adapting
**AlEemaan's already-built, already-verified implementation** (`src/lib/auth/{session,password,
rate-limit}.ts`, full record in that repo's `docs/development-history/phases/phase-0.5.1.5-auth-rebuild.md`)
rather than building from scratch or adopting Better Auth. `domain-implementation-plan.md` §0.5.1
updated with the full reasoning and the explicit "port AlEemaan's code, adapted for
TenantMembership/Campus" instruction. This closes the last open design question blocking §0.5.1 —
nothing left to decide before writing code.

## Auth build (2026-09-30) — built and verified, awaiting merge

Full design decisions: `domain-implementation-plan.md` §0.5.1 → "Build design for the port" (including
"Decisions made during implementation", #1–#15). Live work log, defect table and mutation record:
`docs/development-history/phases/phase-0.5.1-auth.md`. Test guide: `tests/README.md`. Branch
`claude/auth-0.5.1-port` on the maintainer's fork `roji-tech/octalve-edu-fork` (the Claude GitHub App
isn't installed on `octalve-core`, so the maintainer merges by PR).

Built: the schema migration; `lib/auth/{session,password,password-policy,rate-limit,with-auth,
memberships}.ts`; `POST /api/v1/auth/{login,logout}` and `GET /api/v1/auth/me`; the setup route migrated
onto the new helpers; the `/login`, `/dashboard` and `/` screens plus the retrofitted `/setup` wizard on
shared, accessible UI primitives; baseline security headers.

Verified (`pnpm test`): 234 tests pass in under four minutes — 24 unit, 36 integration, 86 API, 80 browser (desktop + phone viewports; axe WCAG 2.2 A/AA clean on every screen *and* state), 7 real-HTTPS — plus clean `tsc`, ESLint and `next build`. Ten defects were found by the verification itself —
among them that bcrypt silently ignores everything past byte 72 (so the design's "128-character cap"
did not do what it said), that a no-JavaScript submit of the sign-in form put the password in the URL,
and that focus was lost after a failed sign-in — each fixed and pinned by a regression test. All 40
deliberately injected bugs (mutation testing) turned the suite red.

## Design language build (2026-09-30) — built and verified, stacked on the auth branch

Design of record: `domain-implementation-plan.md` → "Phase 0.5 addenda" → **0.5.A**. Work log, findings,
mutation record and screenshot review: `docs/development-history/phases/phase-0.5.A-design-language.md`.
Branch `claude/design-tokens-theme` of the same fork, **based on `claude/auth-0.5.1-port`** (merge that
first). Source of the look: the private design canvas "Octalve Edu & AlEemaan — UI Design".

Built: the artifact's colours and layout as a semantic-token system (`globals.css`, with `brand.css` and
`lib/brand.ts` as the only brand-specific files); Octalve's indigo brand; a light/dark theme rendered by the
server from a `theme` cookie (no flash, no inline script — the future nonce CSP depends on that); the shared
components re-skinned to tokens, plus `Card`, `CheckboxField`, `ThemeToggle`; the three existing screens in
the new look; and a **real "Keep me signed in"** — unchecked (the default) gives a browser-session cookie
and a 12-hour server-side cap, ticked gives the 30 d / 90 d policy (7 d for admins). The default session is
therefore *shorter than the first build's* — deliberate, for shared school computers.

Verified: 274 tests pass (5 skipped by design) — up from 234 — including axe WCAG 2.2 on every screen and
state **in both themes**, the theme's server-rendering and keyboard behaviour, the brand's exact colours,
and the remember-me pair over real HTTPS; plus clean `tsc`, ESLint and `next build`. All nine deliberately
injected remember-me bugs turned the suite red. Two flaky *test* races were found and fixed on the way (axe
sampling a colour mid-transition; axe running before Next applied the page's `<title>`).

Not in this branch, by design: the app shell (arrives here with §0.5.2; built in AlEemaan now); "Forgot
password?" (0.5.C); the artifact's search box and notification bell (nothing behind them).

## Nonce-based script CSP build (2026-10-01) — built and verified, stacked again

Design: plan §0.5.B (+ "As built"). Record: `docs/development-history/phases/phase-0.5.B-csp.md`. Branch
`claude/csp-nonce` of the fork, **based on `claude/design-tokens-theme`** (merge order: auth → design language →
this). `src/proxy.ts` mints a fresh 128-bit nonce per page request and sets a strict policy on request and
response (`script-src 'self' 'nonce-…' 'strict-dynamic'`, no `unsafe-inline`/`unsafe-eval`; `upgrade-insecure-requests`
only when `APP_URL` is https); the JSON API gets a static `default-src 'none'; frame-ancestors 'none'`;
`CSP_REPORT_ONLY=true` is the valve for diagnosing a violation on a live deployment. A new auto test fixture
fails any browser test during which the browser reports a violation, so the entire browser suite is a CSP test
— it passed with zero violations, both themes, desktop, phone and https. 11 injected bugs all caught. Finding
worth remembering: `'strict-dynamic'` trusts script created by trusted script, so the policy defends against
**markup** injection (what XSS is); the first injection tests used `createElement("script")` and the "attack"
ran — they now splice attacker markup into the real response.

## Password reset and change build (2026-10-04) — built and verified, stacked again

Design: plan §0.5.C (+ "As built"); extras mapped in §0.5.E. Record: `phases/phase-0.5.C-password-reset.md`. Branch
`claude/password-reset`, **based on `claude/csp-nonce`**. Forgot-password answers identically whether or not the
account exists (content and timing — the work runs in `after()`); the emailed link carries a 256-bit token in the
URL fragment, stored only as a SHA-256 hash, single-use (claimed with a conditional update — 20 concurrent
attempts, one winner) and valid 30 minutes; a reset signs the person out everywhere and does not sign them in;
change-password (a new Account page here, in the plain header until §0.5.2's shell) re-verifies the current
password and keeps only the current session. One shared rule, `checkNewPassword()`, for setup/reset/change.
`lib/email` (Resend by plain fetch / console / file). 377 tests pass; 18 injected bugs all caught (one survived
first — a test was added). Needs `RESEND_API_KEY` + `EMAIL_FROM` in production.

## TOTP two-step verification build (2026-10-05) — built and verified, stacked again

Design: plan §0.5.D (+ "As built"). Record: `phases/phase-0.5.D-totp-mfa.md`. Branch `claude/totp-mfa`, **based on
`claude/password-reset`**. Sign-in becomes two steps for anyone with an *active* second factor: the password yields a
short-lived, attempt-limited **challenge and no session**; `POST /api/v1/auth/login/mfa` with a code or recovery code
is the only thing that then creates one (through the single `completeSignIn()`), carrying the "Keep me signed in"
choice made at step 1. TOTP is our own RFC 6238 (checked against the RFCs' published vectors), secrets are
AES-256-GCM-encrypted under `MFA_ENCRYPTION_KEY` (**required — no key, no MFA**), recovery codes are keyed-hashed,
every "use it once" rule is a conditional update (ten simultaneous submissions of one code: one winner). The account
page has the Two-step verification card (QR drawn in the browser, recovery codes with Copy/Download),
`pnpm mfa:reset -- <email>` is the operator's way back in. 548 tests pass; **49 injected bugs, all caught**. Needs
`MFA_ENCRYPTION_KEY` in production; losing or changing it makes every stored secret undecryptable (→ `mfa:reset`).
(Plan §0.5.F — a dev email inbox, and a mock Paystack with Finance — was designed alongside; the inbox is built, see below.)

## Dev email inbox build (2026-10-05) — built and verified, stacked again

Design: plan §0.5.F (+ "As built — inbox half"), adapted from the maintainer's guide on a dev email system and
dual-mode Paystack. Record: `phases/phase-0.5.F-dev-email-inbox.md`. Branch `claude/dev-email-inbox`, **based on
`claude/totp-mfa`**. A fourth email transport, `inbox`, keeps the last 50 messages in process memory; an in-app
widget (bottom-right launcher, unread badge, text bodies, clickable links) shows them, so reset links and
security notices are readable locally and on staging with no mail provider. Everything hangs off one fail-closed
gate, `devToolsAccess()` in `lib/dev-tools.ts` (`APP_ENV` + `DEV_TOOLS` + a staging token; **never in production**;
the guide's `VERCEL_ENV` test would have been open on a self-hosted install). 622 tests pass; **30 injected bugs,
all caught** (two survived at first and drove two stronger tests). The Paystack half waits for Finance — the plan
lists what must change in it first.

## Account self-service build (2026-10-05) — built and verified, stacked again

Design: plan §0.5.E ("Design for the self-service half" + "As built"). Record: `phases/phase-0.5.E-account-self-service.md`.
Branch `claude/account-self-service`, **based on `claude/dev-email-inbox`**. A signed-in person can **edit their name**,
**change their email address** (the current password is re-checked; a single-use, hashed, one-hour link goes to the *new*
address, the old one is told; confirming switches the address in one transaction and signs the person out everywhere) and
**see and end their active sessions** ("Chrome on Windows", this device first, no IP stored). The change-email request answers
identically for a free and a taken address (the mail runs after the response; a taken address gets a notice, not a link),
and the emailed page waits for a click instead of acting on arrival (mail scanners open links). Tests found four things worth
remembering: a request limit spent before the password check made the password limit unreachable; two "Current password"
labels on one page; a second emailed link opened in the same tab was ignored — **also on `/reset-password` since 0.5.C**
(now one `useFragmentToken()` hook); and focus lost after an awaited save. 740 tests pass; **78 injected bugs, all caught**.
*Invite & activate* and administrator deactivation wait for the Users pages (§0.5.2).

## Tenant trust boundary — application layer (2026-10-05) — built and verified; RLS in the next section

Design: plan §0.5.2 + "Build design" + "As built — application layer". Record: `phases/phase-0.5.2-tenant-boundary.md`; map:
`roadmap-breakdown.md`. Branch `claude/tenant-trust-boundary`, **based on `claude/account-self-service`**. The URL's school code is only a
lookup key: `resolveTenant` finds the signed-in person's own membership (one 403 for unknown / malformed / not-a-member), the branded
`VerifiedTenantId` is the only thing tenant data access accepts, `forTenant` runs one transaction with a transaction-local context, and
`withAuth(…, { tenant: true, roles })` checks the role **in that school**. `/dashboard` is now the front door (one school → in, several →
picker). 811 tests pass; 25 injected bugs caught or equivalent. (The database half is built — next section.)

## Row-level security (2026-10-05) — built and verified

Design: plan §0.5.2 "Build design" items 1–12 + "As built — row-level security". Record: `phases/phase-0.5.2-tenant-boundary.md`. Branch `claude/tenant-rls` (stacked on the tenant-boundary branch).
The `app_user` role was created with the maintainer's approval; **the app and the whole test suite now connect as it** (the table owner is `DIRECT_URL`, for migrations only). A migration enables and **forces**
RLS with `USING` + `WITH CHECK` on `Campus`, `AuditLog` (append-only, two independent locks) and `TenantMembership` (read: tenant **or** own user; write: tenant only); `assertRlsEnforced()` makes a production process
refuse a bypassing role; a **catalog guard** fails the build when a table with a `tenantId` lacks forced RLS or a policy; a **sixth test server** connected as the owner proves the refusal is wired in. **932 tests pass as `app_user`; 44 injected bugs — 43 caught, 1 equivalent** (nine survived the first pass and drove stronger tests; the lesson: test a policy's `WITH CHECK` with statements that return nothing). Detail in the phase record.

## The app shell (2026-10-05) — built and verified

Design: plan "The app shell, and the Users pages with invitations" + "As built — the shell". Record: `phases/phase-0.5.2H-app-shell.md`. Branch `claude/app-shell-users` (stacked on `claude/tenant-rls`).
AlEemaan's shell ported and made **school-aware**: every signed-in page now lives in `src/app/(app)/` inside a sidebar / top bar / phone tab bar + More sheet; the navigation follows the school the path is in (from the
person's own memberships, display only — the pages still guard themselves), with a school switcher for people in several schools; Users and Settings are visible "Soon" entries. 26 injected bugs: 24 caught, 1 at build time,
1 equivalent. Full suite counts are in the phase record.

## Shared API infrastructure (2026-10-05) — built and verified

Design: plan §0.5.3 + "Build design" + "As built". Record: `phases/phase-0.5.3-api-infrastructure.md`. Same branch (`claude/tenant-trust-boundary`).
Strict pagination (offset and cursor) and validation helpers, the first real tenant routes (campuses: paginated, ADMIN-only create, audited in the same
transaction), CSRF hardening (`Sec-Fetch-Site`; `X-Forwarded-Host` no longer trusted by default), a **Redis rate-limit store** behind the same interface
(atomic Lua, memory fallback with a circuit breaker; one conformance suite for both stores), sign-in audit events (device kind, never an IP) and a
fail-open **breached-password check** (k-anonymity). 896 tests pass; 44 injected bugs all caught (three survived first and drove stronger tests).
The plan's gate — the negative tests **as `app_user`** — is met by the RLS work above.

## Who may confirm which payment reference (2026-10-22) - merged into `dev` as PR #60 (`108849e`)
Record: `docs/tasks/0023-payment-status-who-may-confirm.md` (register row ISS-0029). The payment status route let any member of a school confirm any reference of the school and answered with the payment's and invoice's ids, and answered a reference of another school differently from an unknown one. A payment is now as visible as its invoice (`invoiceVisibility`); unknown, another school's and not theirs are the one refusal, and the gateway is not asked for them. Failing first on a build of `dev`; `tests/api/payment-status.spec.ts` (4 tests).

## Next action

**Phases 0.5.1 → 0.5.F are merged to `master`** (the stacked PRs #1–#5 were merged into their stack bases rather than `master`,
so they were consolidated into #6, which landed). **0.5.E (self-service) is open as
[#7](https://github.com/roji-tech/octalve-edu-fork/pull/7)**; **0.5.2 (application layer) and 0.5.3 are pushed on `claude/tenant-trust-boundary`** (based on 0.5.E) and **0.5.2's row-level security on `claude/tenant-rls`** (based on that), no PRs yet.

**The back-port to AlEemaan is done, verified and merged there** — shared names, the hardening deltas, the 72-byte
password policy, `method="post"`, the sign-in screens it lacked and this test suite (`roji-tech/AlEemaan` #2), then
its design language and shell (#3). Its 0.5.B–0.5.F are merged; its 0.5.E is open as [#8](https://github.com/roji-tech/AlEemaan/pull/8). From here on a change to the shared mechanism is made in both repos or logged as a divergence in both
plan docs (§0.5.1.6 there, the shared-names table here).

Then, in order: ~~the Phase 0.5 addenda~~ (0.5.B–0.5.F, all built), ~~the tenant-trust-boundary resolver and `forTenant()`~~ and ~~its explicit RLS role setup~~ (§0.5.2 — built, verified as `app_user`),
~~the shared API helpers and the Redis-backed rate limiter~~ (§0.5.3 — built), ~~this repo's app shell (§0.5.2-H)~~ (built, verified), ~~the Users pages with invitations (§0.5.4)~~ (built, verified, documented — `phases/phase-0.5.4-users-invitations.md`; the survivors' mutation re-check is deferred to the end of Phase 2);
**now: Phase 1 — Core Academics, People, Attendance, Results, Finance & Timetable**

## Phase 1.2 People & Enrollment (2026-10-08) — built, verified and merged
Record: `phases/phase-1.2-people.md`, task register `docs/tasks/0001-phase-1-2-people-and-enrolment.md`. Staff records, student records, guardian links, academic session enrollment, CSV bulk student import with preview/commit transaction. Full RLS policies and catalog tests green.

## Phase 1.3 Attendance & Daily Operations (2026-10-09) — built, verified and merged
Record: `phases/phase-1.3-attendance.md`, task register `docs/tasks/0002-phase-1-3-attendance.md`. Branch `claude/phase-1-3-attendance`. Daily class arm roll-call roster, idempotent attendance marking, 7-day edit grace period for teachers, future-date prevention, attendance percentage computation, mobile-optimized 44px tap targets. Full unit, API, integration and E2E tests green.

## Phase 1.4 Results, Assessment & Report Cards (2026-10-09) — built, verified and merged
Record: `phases/phase-1.4-results-and-grading.md`, task register `docs/tasks/0003-phase-1-4-results-and-publishing.md`. Append-only score audit logs (`ResultAudit`), continuous grade band computation (0-100 scales), GPA calculation, assessment scheme component entry, locked-term publication workflows, student report card generator. Full quality gates green.

## Phase 1.5 Finance, Invoicing & Dual-Mode Paystack Integration (2026-10-10) — built, verified and merged (PR #14)
Record: `phases/phase-1.5-finance-and-billing.md`, task register `docs/tasks/0004-phase-1-5-finance-and-billing.md`. Term fee structures by class group, automated batch invoice generation, partial payments, manual receipt recording, waiver support, dual-mode Paystack checkout (`PAYSTACK_MOCK_MODE=true` for instant interactive simulation / live HMAC-verified webhooks with replay protection via `PaymentWebhookEvent`), and parent/admin invoices dashboard. PR #14 merged into `fork/claude/phase-1-3-attendance`.

## Phase 1.6 Announcements & Timetable Scheduling (2026-10-10) — built, verified, merged (PR #15)
Record: `phases/phase-1.6-announcements-and-timetable.md`, task register `docs/tasks/0005-phase-1-6-announcements-and-timetable.md`. Branch `claude/phase-1-6-timetable`. PR #15 merged into `fork/claude/phase-1-3-attendance`.
- Multi-audience broadcasts (`Announcement`) targeting `Role[]`, `campusId`, `classArmId` with active publish/expiry windows.
- Recurring weekly `TimetableSlot` scheduling per `classArmId`, `subjectId`, `staffRecordId`, `dayOfWeek` (1–7), `startTime`, `endTime`, `room`.
- Pure clash detection engine (`rules.ts`) preventing teacher double-booking, class arm schedule overlap, and room conflicts.
- Interactive TwoNode visual canvas architecture with week grid, real-time conflict badges, and mobile-responsive cards.
- Multi-tenant PostgreSQL RLS (`app_user`, `forTenant()`, `app_tenant_id()`) verified across all tables.
- Full quality gates passing: 287/287 unit tests, 66/66 RLS tests, 20/20 API tests, clean build/typecheck/lint/format.

## Phase 1.7 Settings UI, Step-up MFA & Audit Logging (2026-10-10) — built, verified, all quality gates green
Record: `phases/phase-1.7-settings-and-mfa.md`, task register `docs/tasks/0006-phase-1-7-settings-and-mfa.md`. Branch `claude/phase-1-7-settings`.
- Centralized PRD §14 workflow toggles at `/schools/[code]/settings`: `resultApprovalRequired`, `rolloverMode`, `classAutoAssignment`, `billingCycle`, `feeReminderEnabled`, `discountWorkflowMode`, `feeCostBearer`, `multiCampusEnabled`, `mfaRequiredForTeaching`.
- Step-up authentication gate on all settings mutations: requires fresh TOTP 6-digit code or recovery code if user has MFA enabled, or password re-authentication (`proveOwnPassword`) if not. Explicit warning banner for security-weakening toggles.
- Append-only `SettingsChangeAudit` table tracking actor, field, old value, new value, timestamp, and `stepUpVerifiedAt`. Database-level `REVOKE UPDATE, DELETE, TRUNCATE ... FROM app_user`.
- Activated Settings navigation in `src/components/shell/nav.ts` (replacing disabled "Soon" text).
- Full quality gates passing: 294/294 unit tests, 68/68 RLS tests, 15/15 API tests, Next.js build clean, typecheck clean, lint clean, format check clean.

## Next action (Phase 1.7)
1. Commit branch `claude/phase-1-7-settings` and submit PR to fork (Completed).
2. Advanced to Phase 1.8: End-to-End Hardening, Security Walk & Gate.

## Phase 1.8 End-to-End Hardening, Adversarial Security Walk & Phase Gate (2026-10-10) — built, verified, all quality gates green
Record: `phases/phase-1.8-phase-gate.md`, task register `docs/tasks/0007-phase-1-8-phase-gate-and-hardening.md`. Branch `claude/phase-1-8-gate`.
- **Automated Cross-Tenant IDOR Matrix (`tests/api/idor-audit.spec.ts`)**: 22/22 attack vectors across every Phase 1 model entity verified for zero cross-tenant leakage and graceful 404 responses (Students, Staff, Guardians, Report Cards, Sessions, Class Groups, Class Arms, Subjects, Assessment Schemes, Grade Scales, Invoices, Manual Payments, Discounts, Timetable Slots, Announcements). Resolved `findFirstOrThrow` in results service and normalized manual payment/discount routes to return clean 404s.
- **10-Step Institutional Operational Lifecycle Walk (`tests/integration/phase-1-lifecycle-walk.spec.ts`)**: 11/11 serial tests covering the end-to-end multi-actor institutional lifecycle (Session/Term setup $\to$ Subject offerings & grading $\to$ Staff assignment $\to$ Student enrollment & guardian linking $\to$ Daily roll-call attendance $\to$ CA/Exam score entry & 4-stage approval workflow $\to$ Student/Parent report card $\to$ Fee structure, batch invoicing & Paystack checkout fulfillment $\to$ Timetable slots & announcement broadcast $\to$ Workflow settings mutation with step-up verification).
- **Payment & Webhook Adversarial Security Suite (`tests/api/finance-adversarial.spec.ts`)**: 5/5 tests covering forged HMAC-SHA512 header rejection, missing signatures, replay attack idempotency (`duplicate: true`), kobo amount reduction/tampering detection (`Amount mismatch`), and high-concurrency race condition (20 simultaneous webhook deliveries resolving to exactly 1 success without balance inflation).
- **PostgreSQL `EXPLAIN` Query Plan Sanity (`tests/integration/query-performance.spec.ts`)**: 6/6 tests asserting 100% composite index scans (`Index Scan`, `Bitmap Index Scan`) with zero sequential scans (`Seq Scan`) on tenant tables under production optimizer conditions (`AttendanceRecord`, `Result`, `Invoice`, `TimetableSlot`, `SettingsChangeAudit`, `StudentEnrollment`).
- **Full Quality Gates Passed**:
  - `pnpm test:unit`: 294 / 294 passed
  - `pnpm test:fast tests/integration/rls.spec.ts`: 68 / 68 passed
  - Combined Hardening Suites (IDOR, Lifecycle, Finance Adversarial, Query Performance): 41 / 41 passed
  - `pnpm typecheck`: 0 errors
  - `pnpm lint`: 0 errors, 0 warnings
  - `pnpm format:check`: 100% compliant
  - `pnpm tasks:check`: 100% synchronized across all 7 milestones
  - `pnpm build`: 100% clean Next.js Turbopack build

## Next action
1. Commit branch `claude/phase-1-8-gate` and submit PR to fork `roji-tech/octalve-edu-fork`.
2. Phase 1 (Core SIS + Finance) is 100% Complete. Prepare for Phase 2 (Communication).

## Review fixes: who may read and write what, writes that are all or nothing, request bodies (2026-10-20) - merged into `dev`, not promoted
Record: `docs/tasks/0017-review-fixes-access-atomicity-and-request-bodies.md` (register row 21). Eight pull requests off `dev` (`e99972b`), merged into `dev` in order on 2026-10-20 (19:54 to 19:58 UTC) at the maintainer's instruction, each after its Vercel check passed: #36 `claude/fix-bounded-body-read`, #37 `claude/fix-timetable-write-checks` (two commits), #38 `claude/fix-lms-whose-work`, #39 `claude/fix-results-draft-only`, #40 `claude/fix-attendance-roll`, #41 `claude/fix-report-card-scope`, #42 `claude/chore-source-hygiene`, #43 `claude/fix-names-need-a-visible-character`. They follow the review that wrote the code catalogs (PR #35); each new test was run on an unfixed production build first and failed there.
- **Request bodies:** `validate()` reads through `readBoundedText` (`src/lib/api/read-body.ts`): a body with no declared length is refused as soon as it passes the cap.
- **Timetable:** a batch decides every refusal (references in this school, clashes) before it deletes the arm's lessons, so a refused batch changes nothing (ADR 0002); a one-time change to a lesson is judged against the other time as stored.
- **LMS:** work is stored under the signed-in student's own record (staff name the student); a student sees published work and their own submissions; a parent and non-teaching staff see published work and no submissions; the quiz answer key is for staff; marked work is final for the student; late work is refused when the assignment says so.
- **Results:** a result is edited only while it is DRAFT (rows locked while a request records them); a refused request saves nothing; students must be in this school and the caller's campus; ids, scores (at most 9999.99) and duplicates are validated; listing follows the campus rule.
- **Attendance:** a roll needs an ACTIVE session and names only students on that arm's roll, once each.
- **Report card:** staff read it under the rule the student's attendance history uses (campus; for a teacher, an arm they are assigned to).
- **Source characters:** no source file holds an invisible or direction-changing character typed in as itself (a unit test keeps it so), and a name needs at least one visible character.
- **Verification:** typecheck, lint, prettier clean per branch and on the merge of the six fixes; unit 382 per branch, 385 on the merge of the six and 389 on the merged `dev`; on one production build of the first five changes API 705, integration 614, e2e (attendance, lms-a11y, academics) 15; the last two changes were run as 148 + 40 API tests. NOT run: the API and integration projects per branch. One full suite on the merged `dev` was run afterwards: 2159 passed, 23 skipped, 2 failed (the two repaired in task 0019); an earlier attempt had ended before any test ran (the web servers did not start within 60 s at a load average of 48).

## Teacher assignments for results, and certificates (2026-10-20) - merged into `dev`, not promoted
Record: `docs/tasks/0018-teacher-assignments-for-results-and-certificate-verification.md` (register row 22). Two pull requests off `dev` (`fda8546`), merged into `dev` on 2026-10-20 (#45 at 21:38 and #46 at 21:39 UTC), each after its Vercel check passed: #45 `claude/fix-results-assigned-subject-arm` (two commits) and #46 `claude/fix-certificates-verify-and-access` (two commits, **a migration**). Each new test was run on an unfixed production build first.
- **Results entry:** a teacher records a subject only for students on the ACTIVE roll, in the period's session, of an arm in which they hold a subject assignment for that subject (403 otherwise, nothing saved; an administrator is not held to it; a timetable slot does not count).
- **Results list:** a teacher lists the students on the ACTIVE roll of the arms they are assigned to (a subject assignment or a timetable slot, the attendance definition); the filters only narrow it; a teacher who holds `CAN_APPROVE_RESULTS` keeps the campus-ruled list (a decision made here that the maintainer was not asked).
- **Certificates, verification and numbers:** `GET /api/v1/verify-certificate/[token]` (32 lower-case hex characters; anything else 400, unknown, draft or revoked 404); a new `verificationToken` column with a policy that reads only the one ISSUED row a token names; the number is unique within a school and taken under a per-school advisory lock; an unknown student or period is a 404 before anything is written.
- **Certificates, access:** a student lists their own, a campus member their campus's and the school-wide ones', a campus administrator issues and revokes for their own campus's students only (`certificateScope`).
- **Migration:** `20261029090000_certificate_verification_token`: the maintainer runs it on the hosted database BEFORE the code is deployed there; the release before it keeps working on the migrated schema (checked), the other order would make every certificate read fail.
- **Verification:** every new test failed on an unfixed build first (35 of 139 API and integration tests and 4 of 22 unit tests, each for the intended reason); on the branches' builds results 125 passed and certificates 93 passed; unit 389 and 390; the migration rehearsed over existing certificates; The unit project on `dev` after #45 to #49 (tip `cf32c30`): 396 passed, 0 failed. NOT run: mobile e2e, the https project, the e2e specs, a full suite with both merged, the migration on the hosted database. The first API run found a bug of mine (the number lock used a call that cannot read `void`); fixed before the pull request.

## A request that cannot be valid is a 4xx, and two tests that failed only under load (2026-10-21) - merged into `dev`, not promoted
Record: `docs/tasks/0019-a-request-that-cannot-be-valid-is-a-4xx.md` (register row 23). Three pull requests off `dev` (`a17baa3`), merged into `dev` (#47 at 23:47 on 2026-10-20, #48 at 00:04 and #49 at 00:28 on 2026-10-21, UTC), each after its Vercel check passed: #47 `claude/fix-malformed-path-is-400`, #49 `claude/fix-nul-in-input`, #48 `claude/fix-two-load-sensitive-tests` (two commits). Each new test was run on an unfixed production build first.
- **Broken percent-encoding:** the proxy answers 400 for a path that cannot be decoded, for pages and the API (a bare 500 before); its matcher covers an API path only when it has a percent sign (`/api/(.*%.*)`, task 0021), so an ordinary API request is not buffered by the proxy.
- **NUL character:** refused before the handler: 404 for a path segment and 400 for the query string in `withAuth`, 400 for a JSON body in `validate()`; the routes that read their own body (16) are not behind the body scan and none answers 5xx for a NUL today.
- **An id this school does not have:** four route-and-method pairs answered 500 (PATCH and DELETE of an LMS assignment, DELETE of an LMS material, the payment status for a payment the gateway does not confirm); now 404, 404 and 400 `REFUSED`, found by the extra path test of the NUL branch and fixed in it.
- **Two tests:** the email-change timing check (lower quartile of 12 samples, 250 ms, 240 s of its own) and the account-menu e2e test (waits for the page the person ends up on).
- **Verification:** see the task file. NOT run: the e2e and https projects on the NUL and proxy branches, a full suite with all three merged.

## Results are approved by assignment: generally, per section or per class (2026-10-21) - ADR merged as PR #51 (Proposed), slice 1 merged as PR #54
Record: `docs/tasks/0020-results-approver-scopes.md` (register row 24) and `docs/adr/0018-results-are-approved-by-assignment-generally-per-section-or-per-class.md`. The maintainer decided on 2026-10-21 that approvers are assigned General (their whole campus), per section (primary, JSS, SSS) or per class (JSS 2 ...) in the school's settings, and see and act on only what is assigned; Octalve first, AlEemaan after. PR #51 (merged 2026-10-21 01:15:31 UTC) holds the ADR with the status Proposed; three details wait for the maintainer's yes.
- **Slice 1 (merged as PR #54, `4dd25a1`, 2026-10-21 08:12 UTC):** `Section` and `ResultApprovalScope` tables with row-level security, a nullable `ClassGroup.sectionId`, migration `20261030090000_results_approval_scopes` (it backfills a General scope for every membership that holds `CAN_APPROVE_RESULTS`), `src/lib/results/approver-scope.ts` (`approverScope`, `inScopeResultIds`), the results transitions and list follow the scope (an out-of-scope result is refused as `UNAUTHORIZED` with its own wording; the author's own submit is not scoped; an `ADMIN` is held to no scope), and granting `CAN_APPROVE_RESULTS` gives a General scope.
- **Verification:** failing-first by mutation (with `approverScope()` answering "general" for everybody 12 of 21 new tests fail, 9 controls pass); the migration rehearsed over seeded data; the whole setup, unit, integration and api projects 1832 passed, 3 failed of 1835 (two `mfa.spec.ts` tests pass alone; `body-cap-chunked.spec.ts` "stalls" fails on `dev` since PR #47, see below).
- **Slice 2a (2026-10-23, branch `claude/results-approver-settings-api`, PR open):** the school setting `unsectionedClassApproval` (`GENERAL_OR_CLASS_ONLY` default, or `ANY_SECTION_APPROVER`: an approver with a Section scope also reaches the class groups with no section in the same campus), decided by the maintainer on 2026-10-23 (ADR amendment); migration `20261031090000_unsectioned_class_approval` (an enum and a column with a default); `approverScope` reads it; the settings route carries it with step-up and an audit row, and turning it on is flagged as widening. Failing first by mutation (the rule ignoring the setting: 2 of 9 new tests fail, 7 controls pass); on the fixed build 194 passed, 0 failed (the new spec, the settings specs, the approver-scope and list-scope specs, members, rls, route-area guard, setup, foundations).
- **Not started:** slice 2b (sections and approvers API), slice 3 (settings screen), slice 4 (AlEemaan).

## The proxy's API matcher and the shared body reader (2026-10-21) - task 0021
- **Module A, merged (PR #56, `ae724c9`):** `tests/api/body-cap-chunked.spec.ts` "a chunked body that passes the cap and then stalls still gets its 413" failed alone on `dev` since PR #47: the proxy's matcher covered `/api/:path*`, Next buffers the request body for a proxied request and waits for its END before the route runs, so a body that never ends was never answered. The API entry of the matcher is now limited to paths containing a percent sign (seen failing first on an unfixed build, then passing; the whole setup, unit, integration and api projects 1837 passed, 0 failed).
- **Module B, PR open, verified:** the shared reader `readJsonBody()` for the 16 routes that read their own body, the payment webhook and the student restore route (branch `claude/shared-body-reader`). Failing first on a build of the old routes (14 of 52 failed, 38 controls passed); on the branch the whole setup, unit, integration and api projects: 1929 passed, 0 failed. NOT run: e2e and https.
- **Follow-up, PR open:** every 413 carries `Connection: close` (`fail()` and the payment webhook), because a body over the cap is now refused while the client may still be sending; found in AlEemaan, where the request after such a refusal could be reset. Failing first on a build without it; 140 specs pass.

## Invoice numbers under concurrency (2026-10-21) - merged into `dev` as PR #58 (`be0ae1a`)
Record: `docs/tasks/0022-invoice-numbers-under-concurrency.md` (register row ISS-0030). `generateInvoicesForPeriod` took each number from a count of the school's invoices, so two bill runs at the same moment took the same number and one failed on the unique index. It now takes a per-school advisory lock first (one bill run per school at a time; a second run for the same term finds the first one's invoices) and takes the next free number, passing over one already used. The format and the existing numbers do not change; no migration. `tests/integration/invoice-numbers.spec.ts` (3 tests). Verification: see the PR.

## Next action
1. Merge the reader branch; the maintainer runs `20261030090000_results_approval_scopes` on the hosted database BEFORE the results code is deployed there (the three details of ADR 0018 were confirmed on 2026-10-23: the ADR is Accepted).
2. Slices 2 to 4 of task 0020 (settings API, settings screen, AlEemaan).
3. One shared way to read a body for the 16 routes that read their own (bounded read, NUL scan, a 400 for a body that is not valid JSON); one full run of every Playwright project on the current `dev` (the last one, 2159 passed, 23 skipped, 2 failed, predates #45 to #51).
4. The maintainer runs `20261029090000_certificate_verification_token` on the hosted database before the certificate code is deployed there.
5. The review items tracked outside the repository (it is public), each on its own branch off `dev` with a failing test first; then screens for certificates and results entry, the question-bank parity design, the `/video-guide` pages, a responsiveness audit; Task 0033 (walkthrough video and PDF) runs LAST.
6. Read `docs/HANDOVER.md` section 6 "Start here" and section 7 (how to work here) before anything else.
