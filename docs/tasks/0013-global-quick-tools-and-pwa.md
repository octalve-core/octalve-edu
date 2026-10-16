# 0013: Phase 3 — Global Quick-Tools Dock & Progressive Web App (PWA)

- **Period / Focus:** 2026-10-16 onwards (Global Accessibility, Quick Utilities, Offline Capability & PWA)
- **Status:** Pending
- **Priority:** High
- **Assignee:** Antigravity / Engineering Team
- **Target Branch / PR:** `claude/phase-3-quick-tools-pwa`
- **Started:** —
- **Ended:** —
- **Duration:** —

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Deliver a universally accessible, context-aware **Global Quick-Tools Dock** (accessible anywhere via a floating trigger or keyboard shortcut `Cmd+K` / `Alt+T`), coupled with full **Progressive Web App (PWA)** capabilities. This allows school administrators, bursars, and teachers to instantly execute frequent micro-workflows (e.g. financial calculations, recording cash/pos payments, generating quick payment links, taking quick notes) from any screen without losing their active page context, while transforming Octalve Edu into an installable, offline-resilient mobile and desktop application.

---

## 2. Architectural Context & Design Thoughts

### A. Quick-Tools Overlay & Floating Action Button (FAB)
1. **Trigger & Positioning:**
   - **Desktop:** Floating trigger dock in bottom-right corner (`bottom-6 right-6`), accompanied by a global keyboard shortcut (`Cmd+K` / `Ctrl+K` or `Alt+T`).
   - **Mobile Viewport:** Avoid collision with the 4-tab mobile bottom bar (`MobileNav` at `bottom-0`). The floating button will be positioned at `bottom-20 right-4`, with an option to dock into the mobile top bar or bottom navigation sheet.
   - **Non-Obtrusive Floating Widget:** Draggable or dockable, minimize to pill/bubble, respects system safe areas (`env(safe-area-inset-bottom)`).
2. **Modular Micro-Tool Architecture:**
   - Tool registry pattern: each tool is a self-contained lazy-loaded module implementing `QuickToolDefinition`:
     - `id`: unique tool identifier
     - `title` & `description`: user-facing name and tooltip
     - `icon`: Lucide icon component
     - `requiredRole`: RBAC permissions (`ADMIN`, `CAMPUS_ADMIN`, `TEACHING_STAFF`, etc.)
     - `component`: React component rendered inside the modal/bottom-sheet drawer
3. **Core Tool Suite:**
   - **Universal Calculator:**
     - Standard arithmetic, percentage calculation, memory keys.
     - School-tailored functions: tuition discount calculator, term fee breakdown, GPA/grade average calculator.
     - "Copy Result" and "Paste to active field" utilities.
   - **Fast Payment Recorder:**
     - Instant modal allowing bursars/admins to record an offline payment (Cash, POS, Bank Transfer) directly from any page.
     - Fast student lookup by admission number or name -> select pending invoice -> enter amount & reference -> immediate receipt generation without navigating away from the current task.
   - **Quick Payment & Checkout:**
     - Search invoice and instantly generate a Paystack payment link, QR code, or trigger online payment.
   - **Quick Broadcast / Alert:**
     - Direct jump-in to dispatch an urgent SMS/WhatsApp announcement to a class or guardian without going through the full communication panel.
   - **Quick Scratchpad & Notes:**
     - Local encrypted scratchpad for temporary notes, parent phone numbers, or reminders preserved in `localStorage`.

### B. Progressive Web App (PWA) Foundation
1. **Web App Manifest (`manifest.webmanifest` / `src/app/manifest.ts`):**
   - Application metadata: `name: "Octalve Edu"`, `short_name: "Octalve"`, `start_url: "/dashboard"`, `display: "standalone"`, `orientation: "any"`.
   - Brand theming: `theme_color: "#0f172a"`, `background_color: "#ffffff"`.
   - Comprehensive icon set: standard 192x192, 512x512, and maskable icons for Android adaptive launchers.
2. **App Shortcuts (`manifest.shortcuts`):**
   - Long-press home screen launcher shortcuts:
     - "Record Payment" (`/dashboard?tool=payment-recorder`)
     - "Take Attendance" (`/dashboard?action=attendance`)
     - "Quick Calculator" (`/dashboard?tool=calculator`)
     - "Send Broadcast" (`/dashboard?tool=broadcast`)
3. **Service Worker & Offline Resilience:**
   - App shell precaching and cache-first strategies for static assets, fonts, icons, and CSS.
   - Network-first with offline fallback for tenant data.
   - Offline payment queue: if a bursar records an offline cash receipt in areas with flaky connectivity, queue the transaction locally in IndexedDB and sync automatically when connectivity resumes.
4. **Install Experience:**
   - Unobtrusive custom "Install Octalve Edu App" banner / prompt when `beforeinstallprompt` event fires on compatible browsers.

---

## 3. Work Breakdown (Grouped by Sub-Phase)

### Slice A: PWA Infrastructure & Manifest
- [ ] Implement `src/app/manifest.ts` with standalone display, branding colors, and icons
- [ ] Add app icons (192x192, 512x512, maskable, apple-touch-icon)
- [ ] Configure meta tags, viewport settings, and apple mobile web app capabilities in root layout
- [ ] Define `manifest.shortcuts` for direct launcher deep-links
- [ ] Integrate Service Worker registration for asset caching and offline fallback page

### Slice B: Floating Tools Trigger & Shell Integration
- [ ] Create `QuickToolsFloatingButton.tsx` with responsive positioning (desktop `bottom-6 right-6`, mobile `bottom-20 right-4`)
- [ ] Create `QuickToolsDrawer.tsx` (desktop modal / mobile bottom-sheet drawer with drag-to-dismiss)
- [ ] Global keyboard shortcut listener (`Cmd+K` / `Ctrl+K` or `Alt+T`)
- [ ] Role-based access filtering (hide finance tools from non-bursars/non-admins)
- [ ] Wire floating trigger into `AppShell.tsx` and ensure non-interference with `MobileNav` and modals

### Slice C: Universal School Calculator
- [ ] Implement `CalculatorTool.tsx` with clean touch keypad and keyboard numpad support
- [ ] Include standard math operations (+, -, *, /, %, parenthesis)
- [ ] Add school-specific helper mode: fee discount calculation and term fee summation
- [ ] "Copy Result" button and history tape (recent calculations)
- [ ] Zero layout shift, full WCAG 2.2 keyboard navigation

### Slice D: Quick Payment Recorder & Receipt Generator
- [ ] Implement `PaymentRecorderTool.tsx`:
  - Quick student autocomplete search (debounced, RLS protected)
  - Display outstanding invoices for selected student
  - Fast payment entry: Amount, Payment Method (`CASH`, `POS`, `BANK_TRANSFER`), external reference
  - Submit mutation calling `/api/v1/schools/[code]/finance/invoices/[id]/manual-payment`
  - Instant receipt preview with print/download/share action
- [ ] Offline queuing support in IndexedDB for intermittent connectivity

### Slice E: Quick Broadcast & Action Palette
- [ ] Implement `QuickBroadcastTool.tsx` for fast SMS/WhatsApp dispatch to a guardian or staff member
- [ ] Implement `QuickNotesTool.tsx` persistent scratchpad
- [ ] Implement quick search / command palette jump to any school module

### Slice F: Verification, A11y & Quality Gates
- [ ] Unit tests for calculator engine, payment recorder validation, and PWA manifest
- [ ] E2E tests for floating button click, drawer opening, keyboard shortcut, and calculation flow
- [ ] Axe accessibility audit across drawer open state, keypad, and mobile viewport
- [ ] Lighthouse PWA audit (pass installability, splash screen, service worker checks)
- [ ] Quality gates: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm tasks:check`

---

## 4. Unified Verification & Quality Gates
- [ ] `pnpm typecheck` clean (0 errors)
- [ ] `pnpm lint` clean (0 warnings, 0 errors)
- [ ] `pnpm format:check` clean
- [ ] `pnpm test:fast` passing with zero regressions
- [ ] Lighthouse PWA installable badge verified
- [ ] Full Axe WCAG 2.2 A/AA compliance verified

---

## 5. Deliverables & Documentation
- **Architecture Spec:** `docs/tasks/0013-global-quick-tools-and-pwa.md`
- **Master Plan Register:** `docs/tasks/current-tasks.md`
