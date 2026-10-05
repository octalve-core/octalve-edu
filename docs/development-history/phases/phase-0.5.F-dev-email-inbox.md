# Phase 0.5.F — Dev email inbox

**Status: BUILT AND VERIFIED (2026-10-05) — awaiting the maintainer's merge.** Branch `claude/dev-email-inbox` of
`roji-tech/octalve-edu-fork`, **stacked on `claude/totp-mfa`** (merge order: …→ CSP → password reset → TOTP → this). Live work log until the merge;
append-only after. Design of record: plan → Phase 0.5 addenda → **0.5.F** (written first, from the maintainer's
guide on a dev email system and dual-mode Paystack) and its "As built — inbox half" note. Same change in both
repos (AlEemaan's record is on its `claude/dev-email-inbox`). Test guide: `tests/README.md`.

## What this phase delivers
Reset links, recovery-code notices and every other message the app emails are now **readable in the app itself**
on a developer's machine and on a staging deploy, with no mail provider and no log-grepping — and the whole thing
cannot exist in production.
- **`lib/dev-tools.ts` — the one gate.** `devToolsAccess()` returns `off`, `open` or `{ token }`; everything else
  asks it. `appEnv()` reads `APP_ENV` (`development` | `staging` | `production`, case-insensitive); **any other
  non-empty value is production**; unset means production under `next start` and development under `next dev`;
  `VERCEL_ENV=production` always wins. Production is never on (not with `DEV_TOOLS=true`, not with a token);
  staging needs `DEV_TOOLS=true` **and** a non-empty `DEV_TOOLS_TOKEN` (no token → off, never "open");
  development is on unless `DEV_TOOLS=false`. (The maintainer's guide used `VERCEL_ENV !== 'production'`, which is
  *true* on every host that isn't Vercel — a self-hosted production install would have had the tools open.)
- **A fourth email transport, `inbox`** (`lib/email/transport.ts`): `EMAIL_TRANSPORT` always wins; unset → `resend`
  if `RESEND_API_KEY`, else `inbox` if the tools are on, else `console` (with the existing production warning).
  Choosing `inbox` where the tools are off is a loud error. It logs one line — recipient and subject, **never the
  body** — so a reset link doesn't land in a log. The store (`lib/dev/email-inbox.ts`) is a 50-message ring buffer
  on `globalThis` (survives HMR), bodies capped at 20 KB.
- **`GET` / `DELETE /api/v1/dev/email-inbox`**: a plain 404 where the tools are off; open in development; in
  staging the `x-dev-tools-token` header is compared in constant time (hash-then-`timingSafeEqual`), five wrong per
  IP per 5 minutes → 429, a correct one refunded (the widget polls), a missing header costs nothing; `DELETE` also
  needs `validateCSRF()`; every response `no-store`.
- **The widget** (`components/dev/DevEmailInbox.tsx`), mounted by the root layout only when the gate is on: a
  bottom-right launcher with an unread badge, a dialog (list → message) marked **DEV**, live refresh every 4 s, a
  token form on 401 (kept in `sessionStorage`), message bodies as **text** with every `http(s)` URL also offered as
  a real link, Escape from anywhere, focus handled between list/message/launcher, ≥ 44 px targets, both themes,
  nonce-CSP clean.

## Operations
- **Local:** nothing to set — `pnpm dev` has the inbox on and sends mail there when no `RESEND_API_KEY` is set.
- **Staging:** set `APP_ENV=staging`, `DEV_TOOLS=true` and a long random `DEV_TOOLS_TOKEN`; open the launcher and
  type the token once per tab. Without a token the tools stay *off* on staging (the inbox holds reset links).
- **Production:** set nothing. `APP_ENV` unset under `next start` is production; the tools cannot be enabled there
  by any combination of these variables. Real mail still needs `RESEND_API_KEY` + `EMAIL_FROM`.
- The inbox is **per process**: right for a long-lived server, wrong for serverless (each instance has its own).

## Verification
`pnpm test`: **622 passed, 5 skipped by design, 0 failed** (11.6 min; it was 548) — unit 87, integration 114, api 195,
e2e-desktop 110 (+1 skipped), e2e-mobile 107 (+4), https 8. Static: `tsc`, ESLint, `next build` clean. New:
- **unit** — the gate over every environment combination (**1,344** of them: production never enabled, a typo in
  `APP_ENV` is production, staging needs the flag *and* a token, `open` only ever in development) plus named cases;
  the ring buffer (cap 50, newest first, a copy handed out, on `globalThis`, truncation, unique ids).
- **integration** — the transport matrix (explicit wins; `resend` when keyed; `inbox` when the tools are on;
  `console` when off; `inbox` where off = loud failure and `sendEmailQuietly` false; the log line never contains the
  body; the real reset email lands with its link intact) and the routes in-process per environment: **404 in
  production even with `DEV_TOOLS=true` and the right token** (and nothing cleared), open in development, in staging
  401 for no/wrong/prefix/over-long/upper-cased tokens, 429 after five wrong from one IP, a correct token refunded,
  a missing one free, `DELETE` needing the token **and** a same-origin request (lookalike origins refused).
- **api** — the three production-shaped servers answer 404 for both methods (with the token too) and their pages
  contain no launcher; the staging-mode server's token rules, rate limit, **forgot-password → the message is in the
  inbox → its link really resets the password**, no mail for an unknown address, newest first, `DELETE`.
- **browser** — the launcher on every page (and on no production-shaped page), the token form (wrong token,
  right token, survives a reload, five wrong → locked out), the whole journey (badge → message → link → new
  password), the badge staying correct across a full page load, Clear all, focus at each step and Escape, **hostile
  markup (`<img onerror>`, `<script>`, `javascript:` links) shown as inert text**, the dialog fitting a phone; and
  axe in both themes on the launcher, token form, error, empty inbox, list and a message with a very long link.
- Every browser test is still a CSP test (the widget adds no inline script or style).

### Mutation testing — 30 injected bugs, 30 caught (in both repos)
The gate: production no longer special-cased; `VERCEL_ENV=production` ignored; an unrecognised `APP_ENV` treated as
development; staging open; staging on without `DEV_TOOLS=true`; `NODE_ENV=production` read as development. The store:
uncapped; module-level instead of `globalThis`; bodies untruncated; the live array handed out. The transport: `inbox`
running where the tools are off; production defaulting to `inbox`; the body in the log line; the error no longer
listing `inbox`. The route: answering in production; token unchecked; token compared by prefix; no rate limit; a
correct token not refunded; a missing header costing attempts; `DELETE` without CSRF; `GET` cacheable; `DELETE`
without the token. The layout mounting the widget ungated. The widget: bodies rendered as HTML; a `javascript:`
URL offered as a link; the unread memory lost on reload; Escape ignored; focus not returned to the launcher; focus
left on a vanished button after "Back". **Two survived the first time** (the unread memory and the focus after
"Back"): the tests either raced the second email or never asserted where focus lands. Both were rewritten (the
server must hold both messages before the page reloads, then the badge must *stay* at 1; focus is asserted at each
step) and the mutations re-run: caught.

## Findings and decisions
| # | Found by | What | Resolution |
| :-- | :-- | :-- | :-- |
| 1 | Reading the guide against our hosting | `VERCEL_ENV !== 'production'` is true on any non-Vercel host, so the dev tools would be open on a self-hosted production install; a missing Paystack key would then fall back to a mock that accepts free payments. | An explicit, fail-closed gate (`APP_ENV` + `DEV_TOOLS` + a staging token); production never. (Written into plan §0.5.F for the Paystack half too.) |
| 2 | Reading the guide | The inbox endpoint is unauthenticated, but a reset link or recovery-code notice in it is an account takeover for anyone who finds a staging URL; it can't just need a session (reset happens signed out). | A shared `DEV_TOOLS_TOKEN` on staging, constant-time, rate-limited. |
| 3 | The guide's `dangerouslySetInnerHTML` and `origin.includes(host)` | HTML rendering of mail is an injection surface; a substring Origin test passes `evil-localhost:3000.com`. | Text only (links extracted); our `validateCSRF()`. A hostile-markup browser test and a lookalike-origin test. |
| 4 | The 1,344-combination sweep | `devToolsToken()` returned `null` for both "no token needed" and "none configured". | One `devToolsAccess()` → `off` / `open` / `{token}`. |
| 5 | Browser tests | After "Back to the list" focus fell to `<body>` and Escape did nothing; "unread" reset on every page load. | Focus moved explicitly; Escape on the document; unread kept in `sessionStorage`. |
| 6 | Test design | One shared in-memory buffer for every test. | Every spec clears it first; the four-server layout is written up in `tests/README.md`. |
| 7 | Looking at AlEemaan's shell | A bottom-left launcher would sit on its sidebar and under Next's own dev indicator. | Bottom-right, above the phone tab bar. |
| 8 | Mutation W3, W6 | Two survivors (above). | Tests rewritten; caught. |

## Explicitly not done
The **Paystack engine and mock checkout** from the guide — it needs Finance's fee/invoice models (and a `tenantId` /
branch on `PaymentTransaction`); plan §0.5.F lists what must change in it first. HTML mail, persistence across
restarts, and a shared store for multi-instance deployments. **Next:** 0.5.E account-lifecycle extras (planned),
then §0.5.2.
