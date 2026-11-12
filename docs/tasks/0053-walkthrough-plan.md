# 0053: The walkthrough video and PDF for Octalve Edu: the plan (P0), nothing built yet

- **Period / Focus:** 2026-11-12 (the maintainer: "start the walkthrough videos for both ... a thorough walkthrough video that includes all pages, features, buttons")
- **Status:** In Progress (plan written; no harness, matrix or journey code yet)
- **Priority:** Medium
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-walkthrough-plan` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Produce, for Octalve Edu on its own, a video and a PDF that show every page, feature and button working as a person would use it in a browser, start to finish, and that double as a flow audit: whatever a person cannot do by clicking and typing is a finding, and the findings are fixed. This file is the plan; it follows the rules and phases of AlEemaan's `docs/tasks/0033-walkthrough-flow-audit.md` (the specification both repositories share) and says what is different here.

## 2. Context

- **AlEemaan's harness is built and has three chapters running** (its task 0033, section 6.8: 32 steps, 23 of 328 matrix rows covered). It is the model: a coverage matrix as data, a table of guard rules with tamper lines, observers (console, page errors, failed requests, axe), the `Walk` helpers (one `goto` per tab, key presses at human speed, a visible cursor and caption bar drawn in the page), a runner that drops and recreates a `wip_<repo>_walkthrough` database after checking `select current_database()`, and a report step.
- **What Octalve has is the first version that came in the same commit as AlEemaan's, never run** (`tests/walkthrough/walkthrough.spec.ts`, `support/{walk,overlay,pace,guard.spec}.ts`, `scripts/walkthrough-run/{run,report}.mjs`, `playwright.walkthrough.config.ts`, `src/app/video-guide/page.tsx`). Checked against the code on 2026-11-12: its field names for the setup wizard are right (school name, administrator name and email, password, confirm password), but **it does not type the deployment setup token** (the wizard requires it when `SETUP_TOKEN` is set, as a real deployment does); it **branches on what it sees** (`const onSetup = page.url().includes("/setup"); if (onSetup)`), which the specification forbids; its runner defaults to the role `postgres` with the password `postgres` (Octalve's database roles are the migrator `octalve` and the runtime role `app_user`), passes only `DATABASE_URL` to `prisma migrate deploy` (the schema also needs `DIRECT_URL`, the migrator), and drops whatever database `WALKTHROUGH_DB_NAME` names with no check of the name, the host or other connections; its guard test is the first small version (AlEemaan's was found to let `if (`, `page.goto(`, `evaluate`, cookies, forced clicks and `fill` through); there are no observers and no matrix. AlEemaan's copy of the same first version could not get past its second step either. **It is replaced, not extended.**
- **What is different from AlEemaan** (read from the code on 2026-11-12):
  - **Two deployment modes.** `DEPLOYMENT_MODE=solo` has the first-run wizard at `/setup` (one school, set up by its first administrator); anything else is SaaS, where `/setup` is a 404 and a **platform superadministrator** runs tenants from `/platform`.
  - **Schools are in the address:** every school page is `/schools/[code]/...`; a person may belong to several schools (a school switcher), and each membership has its own role.
  - **Roles:** school administrator (`ADMIN`), campus administrator (`CAMPUS_ADMIN`), teaching staff, non-teaching staff, student, parent (guardian), and the platform superadministrator above the schools. The sidebar differs by role (nav model: `src/components/shell/nav.ts`): administrator 10 entries besides Overview, campus administrator 9 (no Settings), teaching and non-teaching staff 6, pupil "My work", guardian "My children", plus "Platform" for the platform superadministrator.
  - **36 pages and 294 API routes** (counted with `find`), against AlEemaan's 34 and 254.
  - **Features AlEemaan does not have:** tenant onboarding and the platform page, support access with an audit trail, custom domains (the verification step can be shown; the DNS record is a stand-in), a second school to show the walls between tenants, school types and campuses, the Paystack mock, certificates with QR verification, the promotion and result-sheet screens.
- **Pages (36):** `/` (front page), `/setup` (solo only), `/login`, `/forgot-password`, `/reset-password`, `/accept-invite`, `/confirm-email`, `/offline`, `/video-guide`, `/verify` and `/verify/[code]`, `/q/[code]/[token]` (the public questionnaire), `/dashboard` (your schools), `/account`, `/platform`; and under `/schools/[code]`: overview, `academics`, `people` (with `staff/[id]` and `students/[id]`), `finance` (with `invoices/[id]`), `results`, `communication`, `users`, `settings`, `support`, `question-bank`, `forms` (with `[id]`), `programs` (with `[id]` and `certificates/[certId]`), `lms`, `learn` (the pupil's), `children` (the guardian's).

## 3. Decisions proposed (the maintainer confirms or corrects before P1)

- **D1. Two runs, one PR each, Solo first.** Solo mode is the closest to AlEemaan (a wizard, one school, campuses), so its journey reuses AlEemaan's chapter plan and is the first deliverable. SaaS is a second journey (`S` chapters): the platform superadministrator, onboarding a school, the school's first administrator, support access, a custom domain, and a second school to show the walls. *Alternative:* one journey that starts in SaaS and covers everything; rejected as the setup wizard (a feature) would then never be shown.
- **D2. Three passes**, as AlEemaan (desktop light, desktop dark, phone), each from a fresh database; one PDF holds all three.
- **D3. Database `wip_octalve_edu_walkthrough` (Solo) and `wip_octalve_edu_walkthrough_saas`, on :5433, never a lane or `_test` database, never shared**; the runner's `safety.mjs` (copied from AlEemaan) refuses any other name, any non-local host, any other connection, and checks `select current_database()` first. The application connects as the runtime role (`app_user`) and migrates as the migrator, as the lanes do.
- **D4. Ports:** the test lanes shift their ports by 10 x `TEST_LANE`; the walkthrough takes **3330** for the app and nothing for a mail sink (the in-app dev inbox is the stand-in). It is checked free with `ss -ltn` at the start of P1, not assumed.
- **D5. Output** goes to the MAIN checkout's git-ignored `out/walkthrough/octalve-edu/`, never into a worktree.
- **D6. The harness is copied from AlEemaan, not shared:** the two repositories have no common package, and the files are small enough that a copy with Octalve's differences (the `/schools/[code]` addresses, the roles, the cast) is cheaper than a new package. Each copy keeps the other's header note so a fix in one is carried to the other. `source-hygiene` and the catalogues apply to the copies as to any file.

## 4. Work breakdown

### P0: plan, guardrails, matrix (no journey code)
- [ ] **P0.1 Port the harness** from AlEemaan `dev`: `tests/walkthrough/support/{guard-rules,guard.spec,walk,walk.spec,observers,observers.spec,overlay,pace,safety.spec,coverage.spec}.ts`, `scripts/walkthrough-run/{coverage,paths,safety}.mjs` and `safety.d.mts`, a new `run.mjs` and `report.mjs` for Octalve, and `playwright.walkthrough.config.ts` with the `support` project and three passes; remove Octalve's first version. `--project=support` must pass (guard tamper-tested, runner safety, observers, walk helpers).
- [ ] **P0.2 The coverage matrix, computed part:** `coverage.mjs` reads `src/app/**/page.tsx`, the nav model and every `route.ts` and prints the pages with no row, the nav entries with no row, and "API routes with no screen" (a computed list, not a guess). Octalve's nav is a function of the school and the role, not a list; the script needs a small adapter (it calls `navFor` for each role).
- [ ] **P0.3 The rows, by hand,** from the pages above, the HANDOVER and the task records (0001 to 0052): positive rows, and negative rows for every role (what it must be shown NOT being able to do: another school's data, another campus, an approval it may not give, secret exam items), with `typedAddress` rows for the few pages reached by a typed address. A first estimate from the page and route lists: 250 to 300 rows. The maintainer agrees the rows before P1.
- [ ] **P0.4 Environment:** `ffmpeg` and `ffprobe` are installed outside the repository for AlEemaan (`~/.local/bin`); the mp4 and the compression are made after the strict run, as decided there (AlEemaan 0033, D4).

### P1 to P4 (after the maintainer's answers below)
- [ ] **P1 Recon, Solo, chapter by chapter** (each written, run and read before the next): C01 front page, wizard, sign-in; C02 the school (campuses, school type, settings, academic session and terms, the school's profile); C03 people (invitations through the dev inbox, each role signs in, the sidebar of each); C04 students, attendance and the day; C05 coursework, results with approval by scope, promotion, certificates and their public verification; C06 finance (invoices, the Paystack mock, receipts, part payment); C07 question bank, forms, programs, learning; C08 the pupil's and the guardian's portal; C09 account (name, password, email change, two-step, devices) and recovery (forgot and reset).
- [ ] **P1 Recon, SaaS:** S01 the platform superadministrator signs in and onboards a school; S02 the school's first administrator accepts and sets the school up; S03 a second school, and the walls between them (the first administrator is refused the second school's pages, and the reverse); S04 support access (granted, used, audited, revoked), a custom domain (the verification step), the platform page.
- [ ] **P2 Fix** every finding with a regression test that fails on the old code. **P3** one strict, uninterrupted run per pass per mode from an empty database. **P4** the harness as its own PR; each fix its own commit; docs in the same change.

## 5. Questions for the maintainer (the report stops here)

1. **D1: Solo first, then SaaS, as two deliverables?** (Recommended.) Or one journey in SaaS only, with the wizard listed as "Not walked"?
2. **Which school facts and names may the walkthrough use?** The recording is a public artifact; the plan uses fictional names (a demonstration school, `.test` addresses), as AlEemaan's does.
3. **Results approval by scope (ADR 0018) after task 0046:** a campus administrator reaches Results but cannot hold approval permissions (a database constraint); the walkthrough will show exactly that and say so. Say if you want the open decision from HANDOVER (may a campus administrator approve for their own campus) settled first, because the video would then show the answer.
4. **The video guide page (`/video-guide`):** AlEemaan links it from the account menu. Octalve has the page and no link. Link it from the account menu in the same way (recommended), or leave it reachable by address only?

## 6. Not in this task

- Any harness, matrix, journey or fix code: this file is the plan. The next step is P0.1, after the answers above.
- AlEemaan's walkthrough (its own task 0033; chapters C01 to C03 done).
- Real mail, SMS, Paystack and DNS (named in the PDF as "Not walked", with a stand-in where the browser can show one).
