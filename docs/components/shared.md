# Shared — Components

Building blocks used across the app: the form and layout primitives (`ui/`), the app shell and navigation (`shell/`), the service-worker registration (`pwa/`), the
development-only inbox (`dev/`) and the quick-tools drawer (`tools/`).

## `src/components/ui/`

The shared building blocks (buttons, fields, dialog, alerts, icons, theme); they use the colour tokens from `src/app/globals.css`, never palette colours.

| File | Description |
| --- | --- |
| `Alert.tsx` | `Alert({ variant, title, children, className, id, announce })`: boxed message with an icon; variants `error` and `warning` use `role="alert"`, `info` and `success` use `role="status"`. `announce={false}` drops the role for an alert inside a live region the caller owns. No `use client`. |
| `Button.tsx` | `Button`: variants `primary` (default), `secondary`, `ghost`, `danger`; `loading` shows a spinner, disables the button and sets `aria-busy`; `type` defaults to `button`; minimum height 44 px. Other button props pass through. No `use client`. |
| `Card.tsx` | `Card`: the standard raised surface (rounded, bordered, `bg-surface`, padded) as a `div` that passes its props through. No `use client`. |
| `CheckboxField.tsx` | `CheckboxField({ label, ... })`: a real `<input type="checkbox">` inside a `<label>`. The visible box is drawn (brand colour, 3:1 contrast in both themes) and the input is an invisible 44 x 44 px touch target; accepts `ref`. No `use client`. |
| `Dialog.tsx` | Client component `Dialog({ open, onClose, title, description, children, wide })` on the native `<dialog>`: focus trap, Escape (reported through `onClose`) and an inert page come from the platform. It does not close on a backdrop click, since these dialogs hold forms. On open it focuses the child marked `data-initial-focus`, else the first field. Children render only while open, so their state resets on close. |
| `icons.tsx` | 44 inline SVG icon components (`EyeIcon`, `GraduationCapIcon`, `WrenchIcon`, `QrCodeIcon`, and so on): 24 x 24 viewBox, 20 px default, `currentColor`, `aria-hidden`. No icon-library dependency and no `use client`; a new icon is added here. |
| `PasswordField.tsx` | Client component: `TextField` plus a show/hide toggle button (`aria-pressed`, `aria-controls`, label "Show password" or "Hide password"); sets `autoCapitalize` to `none` and turns spell-check off. |
| `SelectField.tsx` | `SelectField({ label, options, hint, error, hideLabel, ... })`: a labelled native `<select>` wired like `TextField` (hint and error through `aria-describedby`, `aria-invalid`); `hideLabel` keeps the label as the accessible name only. No `use client`. |
| `Switch.tsx` | `Switch({ id, checked, onChange, disabled, aria-label, aria-describedby })`: an on/off switch as a real `<button role="switch" aria-checked>`, named by a `<label htmlFor>` pointing at its `id` or by `aria-label`. The button is 44 x 44 CSS px (the tap size every phone screen holds to); the track drawn inside is the familiar 44 x 24. Space and Enter toggle it. Used by the five switches of the school settings Configuration tab (ISS-0033). |
| `TextField.tsx` | `TextField({ label, hint, error, trailing, labelAction, ... })`: a labelled `<input>` with a real `<label htmlFor>`, hint and error linked by `aria-describedby` and `aria-invalid` on error; `trailing` sits inside the right edge, `labelAction` at the end of the label row; accepts `ref`. No `use client`. |
| `ThemeProvider.tsx` | Client component: `ThemeProvider({ initialTheme })` holds the theme the server read from the cookie; `useTheme()` returns `{ theme, toggleTheme }` and throws outside the provider. Toggling sets `<html data-theme>` and writes the `theme` cookie (`Path=/`, one year, `SameSite=Lax`, `Secure` over https). |
| `ThemeToggle.tsx` | Client component: an icon button that flips light and dark through `useTheme`; its label names the action ("Switch to light theme" or "Switch to dark theme") and the icon shows the theme you would get. |

## `src/components/shell/`

The frame around every signed-in page (sidebar, top bar, phone tab bar, breadcrumb, account menu) and the navigation data it is built from; it only displays, every page still guards itself.

| File | Description |
| --- | --- |
| `AppShell.tsx` | Server component that frames every signed-in page: from `lg` up a 248 px sidebar (brand, `SchoolSwitcher`, `SidebarNav`, `SidebarPerson`) and a 60 px top bar (`Breadcrumb`, `ThemeToggle`, `ProfileMenu`); below `lg` a compact bar plus `MobileNav`. Also a skip link to `#main`, `SessionRevalidator`, `SupportBanner` when a support view is open, and `QuickToolsTrigger`. Props: `user`, `schools`, `platform`, `support`. Wraps everything in `ShellProvider`. |
| `Breadcrumb.tsx` | Client component, desktop top bar only: "School name / Page". The first crumb is the school the path is in (else the product name), the second is `pageLabel(pathname)`, and the last carries `aria-current="page"`. |
| `MobileNav.tsx` | Client component, below `lg`: floating bottom tab bar built from `navFor`. With more than 5 links only the first 4 are tabs; the rest go in the "More" sheet, a native modal `<dialog>` that also shows the person and their role, a school list (with 2 or more schools), the Profile link to `/account` and Sign out (`useSignOut`). Any navigation closes the sheet. |
| `nav.ts` | Navigation as data. `navFor(school, platform)`: everyone gets Overview; `ADMIN` adds Academics, People, Communication, Users, Settings; `CAMPUS_ADMIN` the same without Settings; staff roles only Academics and People; students and parents only Overview; platform administrators a Platform link; no school gives "Your schools". An entry with `href: null` shows as "Soon" text (none today). Also `schoolFromPath`, `pageLabel`, `isActive`, `FOCUS_RING`, `initialsOf`. Hiding an entry is a courtesy: the page and the API decide. |
| `PageHeader.tsx` | Server-compatible component: the page's one `<h1>` (`title`), an optional one-line `description` and optional `actions` on the right (stacked on phones). |
| `ProfileMenu.tsx` | Client component: avatar and name button in the top bar that opens a disclosure (`useDisclosure`) with the person's name, email and role in the school in view, a Profile link to `/account`, Sign out via `useSignOut` and, for an `ADMIN`, a non-link "Settings" tagged "Soon" (out of date: `nav.ts` links the built Settings page). |
| `SchoolSwitcher.tsx` | Client component under the brand in the sidebar: no schools draws nothing, one school is plain text, two or more a disclosure of links to `/schools/<code>` with role labels. The links grant nothing; opening one runs the normal membership check. |
| `ShellProvider.tsx` | Client context with the shell's one piece of state: `schools`, `school` (the school the path names, from `schoolFromPath`), `home` (that school, or the only school on pages outside one) and `platform`. `useShell()` throws outside the provider. Derived from the person's own memberships and the path; display only. |
| `SidebarNav.tsx` | Client component: the desktop sidebar links from `navFor(home, platform)`; the current page gets `aria-current="page"`, which also drives the styling; an entry without `href` is plain text with `SoonTag`. |
| `SidebarPerson.tsx` | Client component at the foot of the sidebar: initials avatar, display name (name, else email) and the role label in the school in view (else the email or "Signed in"). |
| `SoonTag.tsx` | Server-compatible component: a "Soon" pill for navigation that is not built, with screen-reader text ", coming soon". Used by `SidebarNav`, `MobileNav` and `ProfileMenu`. |
| `SupportBanner.tsx` | Client component drawn above the page while a platform administrator's support view is open (ADR 0017): school name, "read-only", the allowed area labels and the end time, with a "Leave support view" button that POSTs `/api/v1/platform/support/close` and then loads `/platform` in full. Display only: the pages and routes enforce read-only and the areas. |
| `useDisclosure.ts` | Client hook for a button that shows or hides a panel of links (not an ARIA menu): returns `open`, `toggle`, `panelId`, `buttonRef` and `rootProps`. Closes on Escape (focus back on the button), an outside pointer-down, Tab leaving the root and any route change. Used by `ProfileMenu` and `SchoolSwitcher`. |

## `src/components/pwa/`

Service worker registration and the offline banner.

| File | Description |
| --- | --- |
| `ServiceWorkerRegister.tsx` | Client component mounted by `QuickToolsTrigger` (so on every signed-in page, not on public ones): registers `/sw.js`, asks for the Background Sync tag `sync-pending-payments`, and runs `syncPendingPayments(schoolCode)` when the worker posts `SYNC_PENDING_PAYMENTS` or the browser fires `online` (only inside a school). Shows an amber "Offline Mode" pill while `navigator.onLine` is false; it starts as online to avoid hydration error #418. |

## `src/components/dev/`

The development-only email inbox widget.

| File | Description |
| --- | --- |
| `DevEmailInbox.tsx` | Client component: a bottom-right launcher (unread badge) and a small dialog listing the messages the `inbox` email transport captured, polled from `GET /api/v1/dev/email-inbox` every 4 s, with "Clear all" (`DELETE`). On staging it asks for the dev tools token (header `x-dev-tools-token`, kept in `sessionStorage`). Bodies are text in a `<pre>`, never HTML; http(s) URLs in a body become links. Mounted by the root layout only when `devToolsEnabled()`; renders nothing once the API answers 404. |

## `src/components/tools/`

The Quick Tools dock: a floating button on every signed-in page that opens a drawer of small tools. The role checks here only choose what to show; the API route behind each tool decides.

| File | Description |
| --- | --- |
| `broadcast/QuickBroadcastTool.tsx` | Client component (prop `schoolCode`): urgent-message form with a channel (`SMS`, `WHATSAPP`, `EMAIL`, `IN_APP`), an audience (`GUARDIAN`, `STAFF`, `ALL`, `STUDENT`), four preset texts, an SMS page counter and, for email, a subject. Posts to `/api/v1/schools/[code]/communication/broadcast` (no campus or class arm is sent) and then says "Enqueued in Delivery Bus"; it reads `data.dispatches`, which that route does not return. |
| `calculator/CalculatorTool.tsx` | Client component: keypad calculator (digits, four operators, brackets, `%`, Copy) with keyboard input from a window-level `keydown` listener (Enter and `=` calculate and call `preventDefault`), three fee presets (5% and 10% waivers, 7.5% VAT) and a five-entry history; evaluates with `evaluateArithmetic`. Results carry thousands separators, which the evaluator rejects: `=` after loading a history entry of 1,000 or more shows Error, and a preset on such a result starts from 0. |
| `payments/PaymentLinkTool.tsx` | Client component (prop `schoolCode`): finds a student, lists their invoices, then `POST .../finance/invoices/[id]/pay` with an amount and shows the Paystack `authorizationUrl` as a QR code drawn in the browser (`qrcode`), a copy field, an "Open Checkout" link and a WhatsApp share link carrying the student's name and invoice number. Offered to `ADMIN`, `CAMPUS_ADMIN` and `TEACHING_STAFF`, but that route does not list `CAMPUS_ADMIN`. |
| `payments/PaymentRecorderTool.tsx` | Client component (prop `schoolCode`): records a payment taken outside the app. Student search, invoice choice, amount, channel (`CASH`, `POS`, `BANK_TRANSFER`), a required receipt number and a note, then `POST .../finance/invoices/[id]/manual-payment` and a printable receipt. With `navigator.onLine` false it queues the payment in IndexedDB (`lib/offline/indexed-db.ts`) and shows "Sync Now"; the fallback meant for a failed request never matches, since `sendJson` returns status 0 with no message. Offered to `ADMIN` and `CAMPUS_ADMIN`. |
| `QuickNotesTool.tsx` | Client component: a scratchpad textarea saved on every keystroke to `localStorage` under `octalve_quick_notes`, with Copy, Clear and character and word counts. One key for the whole browser: not per person or school, and sign-out does not clear it. |
| `QuickToolsDrawer.tsx` | Client component: the Quick Tools dialog (hand-rolled `role="dialog"`; closes on Escape or a backdrop click; no focus trap) with a tab per tool the role may use: Calculator and Scratchpad for everyone; Record Payment and Quick Alert for `ADMIN` and `CAMPUS_ADMIN`; Pay Link and QR for those two and `TEACHING_STAFF`. A requested tool the role may not use falls back to the calculator. Props: `open`, `onClose`, `userRole`, `schoolCode`, `initialTool`. |
| `QuickToolsTrigger.tsx` | Client component mounted by `AppShell`: the floating wrench button that opens `QuickToolsDrawer`; Ctrl or Cmd+K and Alt+T toggle it. Opens at once on `?tool=` (`calculator`, `payment-recorder`, `payment-link`, `broadcast`, `scratchpad`), read on first render only. Passes the role and code of the school in the path (none on `/dashboard` or `/account`) and mounts `ServiceWorkerRegister`. |
| `types.ts` | Types: `QuickToolId` (`calculator`, `payment-recorder`, `payment-link`, `broadcast`, `scratchpad`) and `QuickToolDefinition`, which nothing imports. |
