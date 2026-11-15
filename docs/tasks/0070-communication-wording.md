# 0070: Two sentences in Communication say less than they should: a refused template name, and "All 1 messages were sent" (found by the walkthrough's communication chapter, task 0053)

- **Period / Focus:** 2026-11-15 (two wording defects found by reading the screens of C10: a refusal with no reason, and a plural that is wrong for one)
- **Status:** Done (design first, then built; the record is section 6)
- **Priority:** Low to medium (a person is told something failed and not what to change; a line reads as a mistake)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-communication-wording` / PR into `dev`
- **Started:** 2026-11-15

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

1. The "Customize Template" dialog, when the route refuses a name, says **what is wrong** ("Give the template a name of at least 2 characters.") and not only that "Some of the fields are not valid."
2. The line above the Communication tabs says **"The message was sent."** (or "was not sent") when the broadcast had one recipient, and not "All 1 messages were sent."

## 2. How it was found, and what is wrong

Walkthrough chapter C10 (task 0053), read from its screenshots.

1. **A refused template name.** Customizing a template and saving a one-letter name left the dialog open with the alert **"Some of the fields are not valid."** and nothing else: no field named, no reason. The route's answer carries the reason (`details: [{ path: "body.name", message }]`), but (a) `TemplatesManager.tsx` shows only `res.message`, and (b) the reason itself is zod's default text for a minimum length (`name: z.string().trim().min(2).max(100)` has no message), which is not a sentence for a school administrator. The broadcast composer already reads `res.details?.[0]?.message` (task 0056); the template dialog never did.
2. **"All 1 messages were sent."** `SendingProgress.tsx` builds `All ${total} messages were sent.` for every total, so a broadcast to one person (one member of staff, one parent) says "All 1 messages". The same plural is in the longer line for messages that did not go.

## 3. Decisions

- **D1. One helper for "what to tell the person about a refused request":** `reasonOf(reply, fallback)` in `components/auth/postJson.ts`: the first field-level reason if the route gave one, else the route's own message, else `fallback`. The composer's inline expression becomes a call to it (same behaviour).
- **D2. The template routes give a reason a person can act on.** `name`: "Give the template a name of at least 2 characters." and "Keep the template name to 100 characters or fewer."; `subjectTemplate`: "Keep the subject to 255 characters or fewer.". (The body already had "Template body cannot be empty".) The same wording for the create route, which shares the rules and has no screen.
- **D3. The template dialog uses the helper**, so the alert reads the reason. Not changed: where the dialog marks the field (the alert names it in words).
- **D4. Singular wording for one message.** Done: "The message was sent." Not all sent: "The message was not sent." plus the first error and the retry sentence, in the singular. Totals above 1 read exactly as before (two existing specs pin "All 25 messages were sent." and "All 8 messages were sent.").
- **D5. No schema, route-shape or migration change.** Only the text of two validation messages and what two components show.

## 4. Not in this task

The six other components that still read `res.message ||` directly (`AttendancePanel`, `DispatchLogsView`, `SchoolSettingsPanel`, `QuickBroadcastTool`, `PaymentLinkTool` and `PaymentRecorderTool`): most show a message that is already meaningful (a retry failing, a save failing), but a form that posts typed values to a validating route could have the same gap. They were **not** checked one by one; the list is in the HANDOVER for the maintainer.

## 5. Work breakdown

- [x] Design (this file).
- [x] `tests/api/communication-template-reasons.spec.ts` (5 tests): the route's reason for a too-short name, a too-long name and a too-long subject, on the update and the create routes, and a control that a valid name is still kept. Failing first on the unfixed code.
- [x] `tests/e2e/communication-wording.spec.ts` (3 tests, desktop and phone): the Customize dialog shows the reason for a one-letter name and keeps what was typed (axe and overflow in both themes with the refusal shown); the line says "The message was sent." for one message and "The message was not sent." when it failed. Failing first on the unfixed build.
- [x] The fix: `postJson.ts` (`reasonOf`), `communication/http.ts` (the template messages), `TemplatesManager.tsx`, `BroadcastComposer.tsx`, `SendingProgress.tsx` (29 lines added, 10 changed in five files; no route-shape, schema or migration change).
- [x] Catalogue rows, tracker TASK-0070, HANDOVER 6.41.
- [x] Gates in the order tsc, lint, build, tests; Prettier `--check` on the changed files.

## 6. Build record and tests

**Build record (2026-11-15, worktree `octalve-edu-walk`, `TEST_LANE=2`, a production build of exactly the tree tested).**

- Gates in order: `tsc --noEmit` exit 0; `eslint` on the five changed source files and the two specs exit 0; `pnpm build` exit 0; Prettier `--check` clean on the changed files (the five source files were clean at `HEAD`); the catalogue verifier 860 rows, 0 missing.
- **Failing first, the API spec**, on the unfixed code (`src` as on `dev`, built at 18:09): **4 failed, 2 passed** (the `setup` project, and the control that a valid name is still accepted). What the route answered instead of the new sentences is the finding: `"Too small: expected string to have >=2 characters"`, `"Too big: expected string to have <=100 characters"` and `"Too big: expected string to have <=255 characters"`, which is zod's default text and not something to show a school administrator.
- **Failing first, the browser spec**, on the same unfixed build, desktop and phone: **6 failed, 1 passed** (the setup), each of the three tests failing on its own assertion: the Customize dialog's alert was not the reason, and the line above the tabs read "All 1 messages were sent." instead of "The message was sent." (and the failed one likewise).
- **The fixed build:** `unit` **1267 passed**; `api` (the new spec, `communication-nobody`, `communication-campus`, `communication`, `communication-queue`, `communication-tags-recipients`): **43 passed, 0 failed**; browser, desktop and phone, `TEST_TIMEOUT_SCALE=2` (the new spec, `communication-nobody`, `communication-campus`, `communication`, `communication-composer-tags`, `communication-batches`): **37 passed, 0 failed, 0 skipped, 0 flaky**. The three new browser tests ran on both viewports. The two existing specs that pin "All 25 messages were sent." and "All 8 messages were sent." (`communication-batches`) still pass: totals above 1 read as before.

**Not run, and not claimed:** `integration` and `https` projects, the whole suite, the whole responsive spec (the new spec runs axe and overflow in both themes on the dialog that changed), mutation passes (deferred to the end of PHASE 2). **No migration, no environment change.**

**For the maintainer (open, not changed):** six other components still read `res.message ||` directly (`AttendancePanel`, `DispatchLogsView`, `SchoolSettingsPanel`, `QuickBroadcastTool`, `PaymentLinkTool` and `PaymentRecorderTool`). Most show a message that already means something, but a form that posts typed values to a validating route can have the same gap; they were **not** checked one by one, and `reasonOf` is there to use.
