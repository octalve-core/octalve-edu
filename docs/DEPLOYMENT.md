# Deploying Octalve Edu to production

Written for the maintainer: the person who approves a promotion, runs the migrations and holds the Vercel and database accounts. Facts were checked on **2026-11-13** (each says how to check it again); anything not checked says so. Nothing in this file needs a secret written into it, and none should ever be: a value is made on the command line and goes straight into Vercel.

**Read section 3.1 before anything else.** Octalve Edu is a multi-school (SaaS) product that keeps one school's rows from another's with row-level security, and that protection depends on two different database roles. Two things in it are open and are yours to decide: the runtime role on the hosted database (3.2) and how the very first account comes to exist (3.6). Until they are settled the app can be built and deployed, but it will refuse to serve school data, or have nobody who can sign in.

## 0. The short version

1. The decisions of section 2 are made; two actions remain for you (the Vercel Production Branch, the second database), and two open points (2.4).
2. Do the one-time set-up in section 3 (once): the database and its two roles, the environment variables, the domain, the first account.
3. For every release, follow section 4 in order. The order that matters most: **the database migration first, then the code**.
4. If something looks wrong, section 5 (rollback) and section 6 (symptoms) come before anything else.

Two rules sit over every step:

- **Migrations run before the code that needs them, and they are additive.** New code on an old schema fails; old code on a new additive schema keeps working. That is what makes a rollback of the code safe.
- **Nothing reaches `master` or `prod` without your approval of that specific pull request, and nobody but you runs a migration or writes a Vercel secret.** The AI helper is blocked from all three on purpose and will give you the command to run (section 7).

## 1. How it is wired today

| Item | Value | How to check it again |
| --- | --- | --- |
| Branches | `dev` (development, the GitHub default) → `master` (staging by the rule) → `prod` (production by the rule). ADR 0015 records the rule. (`docs/branches-and-environments.md`, written 2026-09-28, still says `main` and "no deploy target": it is out of date.) | `git branch -r` |
| Vercel project | `portfolio-frontend-react-team-2/octalve-edu`, address `https://octalve-edu.vercel.app`, repository `octalve-core/octalve-edu` | `vercel project inspect octalve-edu --scope portfolio-frontend-react-team-2` |
| Node, framework | Node 24.x, Next.js preset | the same command |
| Build | The project's own `build` script, `prisma generate && next build`. | `package.json` |
| **Production Branch in Vercel** | **`master` today; decided: `prod`** (2.1). Until it is changed, every merge into `master` deploys to Vercel's *Production* environment, at the real address. | `vercel api /v9/projects/octalve-edu --scope portfolio-frontend-react-team-2` and read `link.productionBranch` |
| Previews | Every push to `dev` and every pull request gets its own preview address and the **Preview** environment variables. | the pull request's Vercel check |
| Where `master` and `prod` stand | `prod` was last moved on 2026-11-12 (the merge of pull request 100) and has everything `master` has; `master` is at pull request 99 (2026-11-10). On 2026-11-13 `dev` was **65 commits ahead of `master`**. Tags `v1.0.0` and `v1.0.1` exist. | `git rev-list --count origin/master..origin/dev` |
| Automated checks | There is **no GitHub Actions workflow**. The tests are run by hand (section 4, step 1); the only automatic check on a pull request is Vercel's build. | `.github/` does not exist |
| Branch protection | **None** on `master` or `prod` (checked 2026-11-13). Your approval is a rule between you and the helper, not something GitHub enforces. | `gh api repos/octalve-core/octalve-edu/branches/master/protection` answers "Branch not protected" |
| Database | PostgreSQL through Prisma. The hosted one named in `docs/HANDOVER.md` section 3 is `db.prisma.io` with the **old** migration history applied (31 migrations on 2026-10-29; the history is now one baseline). **Its content, its roles and its state were not looked at for this guide.** You said on 2026-11-12 that there is no production data yet. | section 3.2 |
| Environment variables on Vercel | Seen on 2026-11-12, Production: `REDIS_URL`, `POSTGRES_URL`, `DATABASE_URL`, `PRISMA_DATABASE_URL` (Preview and Production) and `CRON_SECRET` (Production only). Everything else in section 3.3 is **not set**, including `DIRECT_URL`. | `vercel env ls --environment production --scope portfolio-frontend-react-team-2` (names only) |
| Scheduled job | `vercel.json` has one cron: `GET /api/v1/cron/dispatch-notifications`, daily at 06:00 UTC, which sends the queued messages. It is on `dev`; it reaches production with the next promotion. It needs `CRON_SECRET` (set) and a **redeploy** after the secret is added. | `vercel.json` |
| Rate limiting | In the server's memory unless `RATE_LIMIT_STORE=redis` (with `REDIS_URL`). On Vercel several instances can run, so set it (section 3.3). | `src/lib/auth/rate-limit.ts` |

## 2. Decisions (made by the maintainer, 2026-11-13) and what each still needs from you

**2.1 `prod` is production, `master` is staging, `dev` is development.** Vercel is **not set that way yet**: its Production Branch is still `master`. **Your action: change it to `prod`** (Vercel dashboard → the project → Settings → Git → Production Branch; newer dashboards: Settings → Environments → Production → Branch Tracking). After that, a merge into `master` builds a **preview** deployment, which is the staging site and uses the **Preview** variables and the Preview database, and only a merge into `prod` goes live. **Until you change it, a merge into `master` deploys to production, so do not merge `dev` → `master` before you have.** The helper does not change Vercel settings.

**2.2 Preview and Production use different databases.** Decided. **Your action:** make the second database and give `DATABASE_URL` a different value for Preview (which serves staging and every pull request's preview) and for Production (3.2). Compare the two values on the Vercel page afterwards (the dashboard shows them to you; do not paste them anywhere): if they are equal, a test on staging writes into production.

**2.3 The hosted database starts empty.** Decided: each environment gets a **new empty database** and the migrations are applied to it from the baseline. The old database (`db.prisma.io`, with the old migration history) is not adopted or reused. Leave it untouched until you have confirmed nothing in it is wanted (you said on 2026-11-12 that there is no production data yet), then delete it at the provider. (AlEemaan's `docs/HANDOVER.md` section 6, task 0052, describes adopting an old database; it is not needed on this path.)

**2.4 Two points of this product are still open and are yours to decide:** the runtime role on the hosted database (3.2) and how the very first account comes to exist (3.6).

## 3. One-time set-up (before the first production release)

### 3.1 Why there are two database roles

The app connects as **`app_user`**, a role that is subject to row-level security. That is what keeps one school's rows from another's. **`DIRECT_URL`** is the role that owns the tables and runs the migrations. If the app ran as the owner (or any superuser, or any role with `BYPASSRLS`) every policy would silently do nothing. So the server asks Postgres who it is, and **in production it refuses to serve school data** unless it is connected as an ordinary role (it logs the reason). `ALLOW_RLS_BYPASS=true` switches the refusal off; it exists for a single-user dev box and must not be set on a deployment with more than one school.

| Variable | Role | Used by |
| --- | --- | --- |
| `DATABASE_URL` | `app_user` (no superuser, no `BYPASSRLS`, owns nothing) | the running app |
| `DIRECT_URL` | the owner / migrator | `prisma migrate deploy`, `pnpm db:roles`, `pnpm platform-admin:make`; **never** set it as the runtime URL |

### 3.2 The database

1. Make two new empty PostgreSQL databases with your provider (TLS on), one for Production and one for Preview (staging and previews; 2.2). For each, note the **owner** connection string: that is its `DIRECT_URL`.
2. **Look before you touch.** These are new databases (2.3). Should you ever point at one that already holds data, list what is in it and take a backup (step 3 below) before anything else. Never run `prisma migrate reset` or `db push` against a hosted database: both erase or reshape it.
3. A backup, whenever a database holds anything, from a terminal where the connection string is set for this one command only:

   ```bash
   pg_dump --format=custom --file=octalve-before-$(date +%F).dump "$DIRECT_DATABASE_URL"
   ```

   Keep the file somewhere private; it holds every school's data.
4. Apply the migrations to each empty database (section 4, steps 3 and 6 give the command and the checks).
5. **Make the `app_user` role (in each database), then check it works. This has not been tried on the hosted database.** With `DIRECT_URL` in the environment for this command only, and `DATABASE_URL` set to the `app_user` connection string you want (the user name must be `app_user`; the password is yours):

   ```bash
   export DIRECT_URL='…' DATABASE_URL='postgresql://app_user:<password>@<host>/<db>?sslmode=require'
   pnpm db:roles          # creates app_user if missing and grants it the runtime privileges (data only: no DDL, no changes to the audit log)
   unset DIRECT_URL DATABASE_URL
   ```

   `CREATE ROLE` needs the `CREATEROLE` privilege. **A managed database may not give it to you** (the hosted Prisma Postgres at `db.prisma.io` may not: unchecked). If the command prints a refusal it also prints the exact `CREATE ROLE` statement for someone with the right to run it; if your provider offers no way to make a role with `NOSUPERUSER NOBYPASSRLS`, **stop and choose another provider** (any plain PostgreSQL that lets you create roles, for example) rather than setting `ALLOW_RLS_BYPASS`.
6. The `DATABASE_URL`, `POSTGRES_URL` and `PRISMA_DATABASE_URL` that Vercel's database integration put on the project are most likely the **owner's**: the app will refuse to serve with one of them as `DATABASE_URL`. Replace `DATABASE_URL` with the `app_user` string and put the owner string in `DIRECT_URL`.

**Keep tests away from the hosted database.** `pnpm test` derives a `<name>_test` database from `DIRECT_URL` and creates it on whatever server that URL points at (as the owner, because it arranges fixtures across schools). Never run the tests, and never keep a hosted URL in a checkout's `.env`, in a shell where you also run tests.

### 3.3 The environment variables

Set each in Vercel for **Production**, and for **Preview** with its own, different, value where the value is a secret. Names only are listed here; make a value with the command given, and let it go straight into Vercel:

```bash
# a generated secret, never printed or typed:
openssl rand -base64 32 | vercel env add MFA_ENCRYPTION_KEY production --sensitive --scope portfolio-frontend-react-team-2
# a value you hold, typed at the prompt:
vercel env add EMAIL_FROM production --scope portfolio-frontend-react-team-2
```

A new variable reaches **new deployments only**: redeploy after adding one (section 4, step 6).

| Name | Needed? | What happens without it | How to make it |
| --- | --- | --- | --- |
| `DATABASE_URL` | **Yes** | The server cannot reach the data; with an owner's string it refuses to serve (3.1). | The `app_user` connection string (3.2). |
| `DIRECT_URL` | **Yes**, for migrations and the operator scripts (set it in your terminal; on Vercel only if the build runs `prisma migrate`, which it does not) | `prisma migrate deploy` and `pnpm db:roles` stop with "Set DIRECT_URL". | The owner's connection string. |
| `APP_URL` | **Yes** | The session cookie is not `Secure` and has no `__Host-` prefix, and links in emails point to the wrong place. | The public address, **`https://`**, no trailing slash. |
| `MFA_ENCRYPTION_KEY` | Yes, if anyone is to use two-step verification; the **platform pages require it** | Two-step verification is unavailable (enrolment answers 503), so no platform administrator can open the platform pages. | `openssl rand -base64 32`. **Back it up privately: losing it means everyone sets two-step verification up again.** |
| `DEPLOYMENT_MODE` | Set it to `saas` | Unset behaves as `saas`, but say it. `solo` is a one-school install (3.6). | `saas` |
| `EMAIL_FROM`, `RESEND_API_KEY` | **Yes, for any email** | Invitations, password resets and notices fail with "is not set up on this server": you cannot invite a school's first administrator by email. | A domain verified with Resend; the sender `Name <no-reply@yourdomain>`; Resend's API key. |
| `CRON_SECRET` | Yes, for queued messages to leave (set on Production since 2026-11-12) | The cron route answers 503 and nothing queued is sent. | `openssl rand -hex 32` (at least 16 characters). Redeploy after adding it. |
| `RATE_LIMIT_STORE` | Recommended | Limits count per instance, so they are looser than their numbers. | `redis` (with the existing `REDIS_URL`; if Redis is down the server falls back to memory and logs it). |
| `REDIS_URL` | With `RATE_LIMIT_STORE=redis` | The server throws at the first sign-in attempt. | The Redis connection string (already set). |
| `PAYSTACK_SECRET_KEY` | If schools take online payments | Payments and the webhook answer 503; production never falls back to a mock. | Paystack's secret key. Webhook address to give Paystack: `https://<your domain>/api/v1/webhooks/paystack`. |
| `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_SECRET_HASH` | Only if Flutterwave is used | | The provider's dashboard. |
| `TERMII_API_KEY` | If schools send SMS or WhatsApp | A message is recorded as failed; Retry works once the key is set. | Termii's dashboard. |
| `DEFAULT_SCHOOL_TYPE` | Only for a Solo install | Unset means K12 (terms). | `K12`, `HIGHER_ED` or `VOCATIONAL`. |
| `CLIENT_IP_HEADER`, `TRUSTED_PROXY_HOPS` | Leave unset on Vercel (see the note) | | |
| `NEXT_PUBLIC_VIDEO_GUIDE_BASE_URL` | Optional | The video guide reads `/media/video-guide` on this site. | An `https://` address of the host that serves the video. |

**Never set on a real deployment:** `ALLOW_RLS_BYPASS` (3.1), `FORCE_MOCK_PAYSTACK`, `ALLOW_MOCK_PAYMENTS_IN_PRODUCTION`, `DEV_TOOLS`, `DEV_TOOLS_TOKEN` and `APP_ENV`. The dev email inbox is never available in production, whatever these say (`VERCEL_ENV=production` always wins).

*Note on `CLIENT_IP_HEADER`.* The rate limiter reads the client's address from a header that the platform in front of the app sets. The default, `x-real-ip`, is what Vercel sets, so no variable is needed there. **This was not tested from here**: after the first deployment, read the logs once (step 7); if the header were missing the server would log `[RATE_LIMIT] No client IP` and every visitor would share one limit.

### 3.4 The schedule

`vercel.json` calls the sender once a day at 06:00 UTC. On Vercel's free plan a daily schedule is the only kind that is valid (a more frequent one makes the deployment **fail**), so a queued message can wait up to a day, unless a person has the Communication page open (it sends ten at a time while open). On a paid plan, change the schedule to every minute (`* * * * *`) in `vercel.json` through a pull request. Check the cron after a deployment: Vercel → the project → Settings → Cron Jobs.

### 3.5 The domain

1. Vercel → the project → Domains → add the domain; make the DNS record Vercel asks for.
2. Set `APP_URL` (Production) to that `https://` address and redeploy.
3. Open `https://<domain>/login`, then `https://<domain>/` (the landing page).

### 3.6 The first account **(open: decide this)**

In SaaS mode the first-run wizard (`/setup`) does not exist (it answers 404), and a school is made from the **platform** pages by a **platform administrator**. `pnpm platform-admin:make -- <email>` makes an existing account a platform administrator, but **the repository has no way to create the very first account on an empty SaaS database**: the route that makes tenants says "SaaS tenants are created by the future self-serve signup flow". I found no script, seed, route or document that does it (2026-11-13). Ask yourself which you want:

- **A. (recommended) A one-time script,** `pnpm platform-admin:create -- <email>`, that creates the first account and makes it a platform administrator, run by you with `DIRECT_URL`, in the same style as `platform-admin:make`. The helper can build it, with a test, on your word. Until then the SaaS deployment has nobody who can sign in.
- **B. A Solo install for one school:** `DEPLOYMENT_MODE=solo` turns the wizard on and makes one school with its administrator. Everything else here applies, except the platform pages and several schools.

Once an account exists (and has turned on two-step verification, which the platform pages require):

1. `pnpm platform-admin:make -- <email>` with `DIRECT_URL` in the environment for that command only.
2. Sign in, turn on two-step verification (Account → Security), then open the platform pages and make the first school.
3. The school's first administrator gets an invitation by email (3.3: needs Resend). If the email is lost or the mail service is down, print the link instead: `pnpm platform-admin:invite-first-admin -- <school-code> <email> --as <platform-administrator-email>`; hand the link over by a channel you trust, because whoever opens it first becomes that school's administrator.
4. That administrator signs in, turns on two-step verification, and sets the school up (the setup guide in the app's video guide walks through it).

## 4. Every release, step by step

Do these in order. Where a step is the helper's and where it is yours is in section 7.

**Step 1. Be sure `dev` is ready.** On a clean checkout of `dev`:

```bash
pnpm install --frozen-lockfile && pnpm prisma:generate
pnpm typecheck && pnpm lint && pnpm format:check
env -u TEST_DATABASE_URL -u DATABASE_URL pnpm build
```

then the tests (`pnpm test` runs a build and every suite: unit, integration, API, browser, HTTPS; it takes hours, only against a throwaway `_test` database, and `pnpm test:lanes` runs several at once, see `README.md`). Read the failures before explaining them. The release pull request must say what was run and what was not.

**Step 2. Read what this release carries.**

```bash
git fetch origin
git log --oneline origin/master..origin/dev | wc -l                 # how many commits
git diff --stat origin/master origin/dev -- prisma/migrations       # new migrations: the ones to run in step 3
git diff origin/master origin/dev -- .env.example vercel.json       # new environment variables, a changed schedule
git diff --stat origin/master origin/dev -- package.json pnpm-lock.yaml   # a new dependency
```

Write down: the migrations (in order), the new variables, and anything in `docs/HANDOVER.md` marked "for the maintainer".

**Step 3. Migrate the staging (Preview) database. You do this, before the staging code is merged.**

1. In a terminal that is not used for tests, with the **owner's** connection string of the **Preview** database set for these commands only (Prisma needs `DATABASE_URL` to exist too, but uses `DIRECT_URL` for migrations):

   ```bash
   export DIRECT_URL='…' DATABASE_URL="$DIRECT_URL"   # the Preview database; paste, do not save either in .env
   pnpm prisma migrate status       # what is pending
   pnpm prisma migrate deploy       # applies the pending ones, in order, and nothing else (NOT `migrate dev`: README explains why)
   pnpm prisma migrate status       # must say: Database schema is up to date
   pnpm db:roles                    # re-applies app_user's privileges to anything the migrations added
   unset DIRECT_URL DATABASE_URL
   ```

2. A migration that fails stops the run and leaves a failed row: read the error, do not rerun blindly, and do not deploy the code.

Today's pending migration on a new empty database: the baseline `20260927053552_baseline`, and nothing after it.

**Step 4. Set what is new.** Add every new variable from step 2 (3.3) for **Preview** and, with its own value where it is a secret, for **Production**. Remember a variable reaches new deployments only.

**Step 5. Staging: a pull request `dev` → `master`, and approve it.**

1. Open the pull request. The description lists the commits' themes, the migrations (already run on the staging database, step 3), the new variables, what was tested and what was not. Check that its base is `master` and its head is the commit you tested.
2. Wait for Vercel's check to be a success and GitHub to say the pull request is mergeable.
3. **You approve and merge.** (Only after 2.1 is done: before it, this merge deploys to production.) Vercel builds the staging site from `master`; find its address on the project's Deployments page, filtered to the `master` branch.
4. Run the checks of step 7 against staging. Fix what they find on `dev` and promote again; do not go on to step 6 with a staging that is wrong.

**Step 6. Production: migrate its database, then a pull request `master` → `prod`.**

1. Take a backup if the production database holds anything (3.2, step 3). A migration cannot be undone by a rollback of the code.
2. Run step 3's commands with the connection strings of the **Production** database. Read `migrate status`: it must say the schema is up to date.
3. Open the pull request `master` → `prod`, check its base and head, wait for the green check, **approve and merge**. Vercel deploys to production.
4. If you added variables after the last build, redeploy so they take effect: Vercel → Deployments → the latest → Redeploy (leave "use existing build cache" off if a variable changed that the build reads). The first deployment that carries `vercel.json`'s cron also needs `CRON_SECRET` to be present at that deployment.

**Step 7. Check it is really up.** Read the deployment first, then use the site.

```bash
vercel ls octalve-edu --environment production --scope portfolio-frontend-react-team-2     # the newest should be Ready
vercel inspect <deployment address> --scope portfolio-frontend-react-team-2
vercel logs --deployment <dpl_id> --since 15m --scope portfolio-frontend-react-team-2      # read the first minutes
```

A green "Ready" is **not** proof: a server that cannot reach its data, or that refuses to serve because of its database role, also shows Ready. Do this on staging after step 5 (with its address) and again on production after step 6. In a private window:

- [ ] `/login` answers 200 and shows the sign-in form.
- [ ] `/` shows the landing page (signed out).
- [ ] Sign in as a platform administrator (two-step verification asked); the platform pages open.
- [ ] Open a school's own sign-in and its dashboard: data loads (a 500 or a message about the database role means 3.1).
- [ ] Open the page that the release changed, and one page that it should not have (Students, Results).
- [ ] An email arrives: invite yourself with a second address, or Forgot password.
- [ ] Vercel → Settings → Cron Jobs lists the dispatch cron; after its first run the Communication screen shows queued messages sent.
- [ ] `vercel logs` shows no repeating error, no `[RATE_LIMIT] No client IP` line, and no row-level-security warning.

**Step 8. Record it.** In `docs/HANDOVER.md` write the date, the commit on `master`/`prod`, the migrations run and the variables added. Tag the release if you tag (`git tag -a v… <commit>`; the last tags are `v1.0.0` and `v1.0.1`).

## 5. Rolling back

- **The code:** Vercel → Deployments → the previous good production deployment → "Promote to Production" (or Instant Rollback). It takes seconds and does not touch the database. It is safe because migrations are additive: the old code ignores new columns. (After a rollback the next push to `prod` deploys the new code again: fix it in git too, by reverting on `master` and promoting the revert.)
- **A bad migration:** there is no automatic undo. Stop the release, restore the backup of step 3 into a new database if data was damaged, point `DATABASE_URL` and `DIRECT_URL` at it, and write a corrective migration. A migration that drops or rewrites data is not additive and needs its own plan, written before step 3.
- **A leaked or wrong secret:** replace it in Vercel and redeploy. `MFA_ENCRYPTION_KEY` replaced means everyone sets two-step verification up again (`pnpm mfa:reset -- <email>`). A leaked `app_user` or owner password: change it at the database and in Vercel, and redeploy.

## 6. When something is wrong

| Symptom | Cause to check first |
| --- | --- |
| Every school page is a 500 and the log names a database role ("superuser", "BYPASSRLS", "OWNS the tables") | `DATABASE_URL` is the owner's (3.1, 3.2 step 6). Use the `app_user` string. Do not set `ALLOW_RLS_BYPASS`. |
| `permission denied` for a table, from the app | `app_user` lacks the runtime privileges: run `pnpm db:roles` with `DIRECT_URL` after the migration (step 3). |
| `prisma migrate deploy` says "Set DIRECT_URL" or fails to connect | `DIRECT_URL` is not in the environment of that terminal (it is not read from Vercel). |
| `migrate deploy` says the database is not empty or has a failed migration | The database is not a new empty one (2.3), or an earlier run failed. Read `prisma migrate status`; do not mark anything resolved until you know which. |
| A deployment fails to build with a cron error | `vercel.json` has a schedule the plan does not allow (more often than daily on the free plan). |
| The cron route answers 503 | `CRON_SECRET` is missing or shorter than 16 characters in that deployment: add it and redeploy. |
| No emails arrive | `EMAIL_FROM` and `RESEND_API_KEY` missing, or the sending domain is not verified. |
| Links in emails go to the wrong address | `APP_URL` is not set for this environment (3.3). Set it, redeploy, and send the email again. |
| Nobody can sign in on a fresh database | No account exists (3.6). |
| A platform administrator cannot open the platform pages | Two-step verification is not turned on for them, or `MFA_ENCRYPTION_KEY` is not set. |
| A page says a table or column does not exist | The code is live but a migration was not run (step 3 was skipped). Run it; the old code still works meanwhile, so rolling back is an option. |
| Online payment answers 503 | `PAYSTACK_SECRET_KEY` missing for this environment. |

## 7. Who does what

- **You** (the git user `roji-tech`): the actions in section 2, the decision in 3.6, approving and merging into `master` and `prod`, running the migrations (step 3), making the database roles, writing every Vercel secret, changing Vercel and DNS settings, the Resend, Paystack and Termii accounts.
- **The AI helper:** may merge into `dev` after the checks pass; may read Vercel (`ls`, `inspect`, `logs`, `env ls` shows names only); prepares the pull requests and this checklist's evidence. It does not merge into `master` or `prod`, run a migration on a hosted database, write a secret or redeploy production, because it is blocked from each (and the rule says so). When it needs one of them it gives you the exact command and waits.
- **Nobody** pastes a connection string, a secret or a key into a chat, a pull request, a commit or a log.

## 8. The checklist, to copy into the release pull request

```
[ ] Vercel Production Branch is `prod` (2.1)        [ ] Preview and Production databases differ (2.2)
[ ] app_user exists and DATABASE_URL is its string; DIRECT_URL is the owner's (3.1, 3.2)
[ ] a way to create the first account exists (3.6)
[ ] dev is green: typecheck, lint, format, build, tests (step 1) — what was NOT run is written down
[ ] migrations listed (step 2) and run on the Preview database (step 3)
[ ] new variables set for Preview and Production (step 4)
[ ] PR dev -> master: base and head checked, Vercel check green, approved and merged (step 5)
[ ] staging checks passed (step 7)
[ ] Production database migrated, backup taken if it held anything (step 6)
[ ] PR master -> prod: base and head checked, approved and merged (step 6)
[ ] production checks passed, logs read (step 7)
[ ] HANDOVER updated (step 8)
```
