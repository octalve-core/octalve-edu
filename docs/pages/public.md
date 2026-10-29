# Public pages and app-level files — Pages

Everything a person can reach without a school in the URL (sign-in, account recovery, invitations, email confirmation, the first-run set-up wizard, the landing and offline pages), then
the files of `src/app/` that wrap every page (root layout, web manifest, icons, global styles).

## Sign-in, recovery and set-up

| Route | File | Description |
| --- | --- | --- |
| `/login` | `login/page.tsx` | The sign-in page. Open to a signed-out visitor; a signed-in person is redirected to `/dashboard`, and on a Solo install (`DEPLOYMENT_MODE=solo`) whose setup is not finished (`isSetupComplete()` is `false`) the visitor is redirected to `/setup`. Renders the colocated `LoginForm` (password step, then the two-step verification step) inside `AuthShell`. `force-dynamic`: it reads the session cookie and the database. |
| `/forgot-password` | `forgot-password/page.tsx` | Step 1 of password recovery, for a signed-out visitor. A signed-in person is redirected to `/dashboard` (they change the password from `/account`). Renders `ForgotPasswordForm` inside `AuthShell`; `force-dynamic`. |
| `/reset-password` | `reset-password/page.tsx` | Step 2 of password recovery, opened from the emailed link. No session check and no redirect for a signed-in person. Renders `ResetPasswordForm` inside `AuthShell`; the token is in the URL fragment, with `referrer: no-referrer`, `force-dynamic` and a `noscript` note. A missing or dead link shows "This link can't be used" with a link to `/forgot-password`. |
| `/accept-invite` | `accept-invite/page.tsx` | Public page an invitation email opens. It never calls `requirePageSession`, so a signed-out visitor, the invitee and a different signed-in account can all open it; what it offers depends on who is looking. Renders `AcceptInviteForm` inside `AuthShell`. The invitation token travels in the URL fragment, so the page sets `referrer: no-referrer`, `force-dynamic` and a `noscript` note (the form needs JavaScript). A missing, used or expired token shows "This link can't be used" with a link to `/login`. |
| `/confirm-email` | `confirm-email/page.tsx` | Public page that the confirmation link opens (the link is mailed to the NEW address when someone changes their email). No session check, so it works signed in or out. Renders `ConfirmEmailForm` inside `AuthShell`; the token is in the URL fragment, the page sets `referrer: no-referrer` and `force-dynamic`, and the form waits for a click before it spends the single-use token. A missing or dead link shows an error with a link to `/account`, which sends a signed-out visitor to `/login`. |
| `/setup` | `setup/page.tsx` | First-run wizard of a Solo install. Only when `DEPLOYMENT_MODE=solo`: in any other mode it calls `notFound()` (404). Once setup is complete it redirects to `/login`; if the database cannot be read (`isSetupComplete()` returns `null`) the form is shown anyway, so a deployer is not locked out. Renders the colocated `SetupWizardForm` with `requiresToken` (a `SETUP_TOKEN` is set) and `insecureBaseUrl` (a production build whose `APP_URL` is not https). No session is involved; the `POST /api/v1/setup` behind the form creates the school and its first administrator. |

## Landing and offline

| Route | File | Description |
| --- | --- | --- |
| `/` | `page.tsx` | Router that never renders UI (`force-dynamic`), open to anyone: a signed-in visitor (`getSession()`) goes to `/dashboard`; otherwise, with `DEPLOYMENT_MODE=solo` and first-run set-up known to be incomplete, to `/setup`; otherwise to `/login`. An unknown set-up state (database error) does not redirect to `/setup`. |
| `/offline` | `offline/page.tsx` | Static page anyone can open (no data, no session check): says the person is offline, that the Quick Tools dock still works and that payments logged offline sync when the connection returns, with a `Try Reconnecting` link to `/`. `public/sw.js` serves it as the fallback for a failed navigation, if it has it cached. |
| `/video-guide` | `video-guide/page.tsx` | In-app video guide and product walkthrough player: HTML5 video player with WebVTT subtitles, interactive chapter seeking sidebar, and downloads for full video and captioned PDF. |


## App-level files (`src/app/`)

| Route | File | Description |
| --- | --- | --- |
| `layout (root)` | `layout.tsx` | Root layout of every page: loads the Geist fonts, sets the title template and description from `brand`, reads the `theme` cookie so `<html data-theme>` is right on the first paint (this also makes every page dynamic, as the nonce CSP needs), wraps the page in `ThemeProvider` and mounts `DevEmailInbox` only when `devToolsEnabled()`. No access check: each page guards itself. |
| `metadata: web manifest` | `manifest.ts` | Web app manifest: `start_url` `/dashboard`, standalone display, theme colour `#0f172a`, icons `/icon` and `/apple-icon`, and five launcher shortcuts to `/dashboard?tool=payment-recorder`, `?tool=calculator`, `?tool=broadcast`, `?tool=payment-link` and `?action=attendance`. Only `tool` is read (by `QuickToolsTrigger`; outside a school the payment, link and alert tools fall back to the calculator); nothing reads `action`, and `/dashboard` redirects a one-school person without the query string. |
| `metadata: app icon` | `icon.tsx` | Generates the `/icon` PNG (512 x 512) with `ImageResponse`: the same graduation-cap drawing as the Apple icon on a dark slate square with a 96 px corner radius. The web manifest lists it (`any`) and `public/sw.js` pre-caches it. |
| `metadata: apple icon` | `apple-icon.tsx` | Generates the `/apple-icon` PNG (180 x 180) with `ImageResponse`: a white graduation-cap outline on a dark slate (`#0f172a`) rounded square. Public; the web manifest lists it as `maskable` and `public/sw.js` pre-caches it. |
| `metadata: favicon` | `favicon.ico` | Binary `.ico` holding four 32-bit images (16, 32, 48 and 256 px), served by Next at `/favicon.ico`. `src/proxy.ts` excludes this path, so it carries no CSP header. |
| `styles: global` | `globals.css` | Tailwind entry: imports `tailwindcss` and `brand.css`; holds the colour tokens for the dark and light themes and exposes them to Tailwind with `@theme inline` (`canvas`, `surface`, `line`, `fg`, `brand-*`, `danger-*`, `warn-*`, `info-*`, `ok-*`). Also `body` colours, `.brand-pattern` (the sign-in panel grid) and a reduced-motion rule. No `dark` custom variant exists, so Tailwind `dark:` classes follow the OS, not the theme cookie. |
| `styles: brand` | `brand.css` | Octalve's indigo brand tokens (`--brand`, `--brand-strong`, `--brand-strong-hover`, `--brand-deep`, `--brand-fg`, `--brand-tint`): dark values on `:root`, with `--brand-fg` and `--brand-tint` overridden when `data-theme` is `light`. One of the two per-repo brand files (the other is `lib/brand.ts`); imported by `globals.css`. |
