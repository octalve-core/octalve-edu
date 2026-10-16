# 0013: Phase 3 — Global Quick-Tools Dock & Progressive Web App (PWA)

- **Period / Focus:** 2026-10-16 onwards (Global Accessibility, Quick Utilities, Offline Capability & PWA)
- **Status:** Completed
- **Priority:** High
- **Assignee:** Antigravity / Engineering Team
- **Target Branch / PR:** `claude/phase-3-quick-tools-pwa`
- **Started:** 2026-10-16
- **Ended:** 2026-10-16
- **Duration:** 1 day

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
     - "Quick Notes" (`/dashboard?tool=scratchpad`)

---

## 3. Work Breakdown (Grouped by Sub-Phase)

### Slice A: PWA Infrastructure & Manifest
- [x] Implement `src/app/manifest.ts` with standalone display, branding colors, and icons
- [x] Add dynamic app icons via `ImageResponse` (`src/app/icon.tsx`, `src/app/apple-icon.tsx`)
- [x] Configure meta tags, viewport settings, and apple mobile web app capabilities in root layout
- [x] Define `manifest.shortcuts` for direct launcher deep-links

### Slice B: Floating Tools Trigger & Shell Integration
- [x] Create `QuickToolsTrigger.tsx` with responsive positioning (desktop `bottom-6 right-6`, mobile `bottom-20 right-4`)
- [x] Create `QuickToolsDrawer.tsx` (desktop modal / mobile bottom-sheet drawer with drag-to-dismiss)
- [x] Global keyboard shortcut listener (`Cmd+K` / `Ctrl+K` or `Alt+T`)
- [x] Role-based access filtering (hide finance tools from non-bursars/non-admins)
- [x] Wire floating trigger into `AppShell.tsx` and ensure non-interference with `MobileNav` and modals

### Slice C: Universal School Calculator
- [x] Implement `CalculatorTool.tsx` with clean touch keypad and keyboard numpad support
- [x] Pure mathematical engine using Dijkstra's Shunting-Yard algorithm (100% CSP compliant, zero eval)
- [x] Include standard math operations (+, -, *, /, %, parenthesis)
- [x] Add school-specific helper presets: fee discount calculation (-5% sibling, -10% staff) and VAT (+7.5%)
- [x] "Copy Result" button and history tape (recent calculations)
- [x] Zero layout shift, full WCAG 2.2 keyboard navigation

### Slice D: Quick Payment Recorder & Receipt Generator
- [x] Implement `PaymentRecorderTool.tsx`:
  - Quick student autocomplete search (debounced, RLS protected)
  - Display outstanding invoices for selected student
  - Fast payment entry: Amount, Payment Method (`CASH`, `POS`, `BANK_TRANSFER`), external reference
  - Submit mutation calling `/api/v1/schools/[code]/finance/invoices/[id]/manual-payment`
  - Instant receipt preview with print/download/share action

### Slice E: Quick Notes Scratchpad
- [x] Implement `QuickNotesTool.tsx` persistent auto-saving scratchpad with `localStorage` backing
- [x] Copy and clear notes actions

### Slice F: Verification, A11y & Quality Gates
- [x] Unit tests for calculator engine, payment recorder validation, and PWA manifest (9/9 passed)
- [x] E2E tests for floating button click, drawer opening, keyboard shortcut, and calculation flow (3/3 passed)
- [x] Axe accessibility audit across drawer open state, keypad, and mobile viewport (0 violations)
- [x] Quality gates: `pnpm typecheck` (0 errors), `pnpm lint` (0 errors, 0 warnings)

---

## 4. Unified Verification & Quality Gates
- [x] `pnpm typecheck` clean (0 errors)
- [x] `pnpm lint` clean (0 warnings, 0 errors)
- [x] `pnpm test:fast tests/unit/quick-tools.spec.ts` (9 passed)
- [x] `pnpm test:fast tests/e2e/quick-tools.spec.ts` (3 passed)
- [x] Full Axe WCAG 2.2 A/AA compliance verified

---

## 5. Deliverables & Documentation
- **Architecture Spec:** `docs/tasks/0013-global-quick-tools-and-pwa.md`
- **Master Plan Register:** `docs/tasks/current-tasks.md`
