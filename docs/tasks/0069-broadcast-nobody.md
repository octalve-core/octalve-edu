# 0069: A broadcast that reaches nobody says so, and says why (found by the walkthrough's communication chapter, task 0053)

- **Period / Focus:** 2026-11-15 (a flow-audit finding: the composer reports success for a broadcast that was sent to no one)
- **Status:** Done (design first, then built; the record is section 6)
- **Priority:** Medium (a school believes it told every parent; the screen said it had succeeded)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-broadcast-nobody` / PR into `dev`
- **Started:** 2026-11-15

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

When a broadcast has no one to go to, the composer says **nothing was sent and why**, keeps what the person wrote, and stays where it is. It no longer shows a green "queued successfully" and moves to a log in which nothing was added.

## 2. How it was found, and what is wrong

Reading the composer and `createBroadcast` for the walkthrough's communication chapter (task 0053, C10). A guardian is a recipient of an **email** only when their record has an email address, and of an SMS or WhatsApp message only when it has a phone number (`service.ts`: `if (address?.trim())`); a guardian or member of staff without one is skipped **silently**. In the walkthrough's school the two guardians have a phone number and no email, so an email to "Parents / Guardians" reaches nobody. The route answers `201 { count: 0 }`, and the composer, which only reads `count`:

- shows the **success** alert "Broadcast queued successfully for 0 recipients via EMAIL." (the singular/plural line even handles `0`, so it was written to be seen);
- clears the subject and the text (the person's work is gone);
- and calls `onBroadcastSent()`, which switches to the delivery log, where nothing new appears.

Nothing is wrong with the data: a school can well have parents whose email it never recorded. What is wrong is that the screen says it worked. The same silence hides a partial case (some of the audience skipped): that is not shown anywhere either, and is not changed here (D4).

## 3. Decisions

- **D1. The service counts who was skipped.** `createBroadcast` answers `{ count, channel, withoutAddress }`: `withoutAddress` is the number of **people** (each guardian or member of staff once, even when a guardian has two children in the chosen class) in the audience who have no address for the channel. Additive: nothing that reads `count` and `channel` changes.
- **D2. The composer tells the truth when `count` is 0.** A **warning** alert, not a success: "Nothing was sent. 2 people in this audience have no email address on record. Add it to their record, or choose another channel." (a phone number for SMS and WhatsApp; "1 person ... has"). When nobody is in the audience at all (a class with no pupils): "Nothing was sent: nobody is in this audience." What the person wrote is **kept**, the tab does **not** change, and no sending is started.
- **D3. When somebody can be reached,** nothing changes: the success alert, the cleared form, the switch to the log, the sending line.
- **D4. Not built, offered:** a note for the partial case ("3 people with no email address were skipped"). The composer is replaced by the delivery log at that moment, so the note would need a place on the log or above the tabs; that is a design question for the maintainer, and `withoutAddress` is in the answer for when it is wanted.
- **D5. No route, schema or migration change.** The route already returns whatever the service answers.

## 4. Not in this task

D4; the same silence in the system messages sent by events (an absence notice to a guardian with no phone or email is skipped without a trace: a different place, and a different decision about whether a school wants to hear of each).

## 5. Work breakdown

- [x] Design (this file).
- [x] `tests/api/communication-nobody.spec.ts` (6 tests): guardians with a phone number and no email, with neither, with both, a member of staff with an email; the counts for each channel and audience, a class with no pupils, a guardian with two children in the class counted once; nothing queued when `count` is 0. Failing first on the unfixed code.
- [x] `tests/e2e/communication-nobody.spec.ts` (2 tests, desktop and phone): the warning's words and no "queued successfully"; the text kept, the tab unchanged, nothing queued; axe and overflow in both themes with the warning showing. Failing first on the unfixed build.
- [x] The fix: `service.ts` (`withoutAddress`) and `BroadcastComposer.tsx` (32 lines added, 6 changed in two files; no route, schema or migration change).
- [x] Catalogue row, tracker TASK-0069, HANDOVER 6.40.
- [x] Gates in the order tsc, lint, build, tests; Prettier `--check` on the changed files.

## 6. Build record and tests

**Build record (2026-11-15, worktree `octalve-edu-walk`, `TEST_LANE=2`, a production build of exactly the tree tested).**

- Gates in order: `tsc --noEmit` exit 0; `eslint` on the service, the composer and the two specs exit 0; `pnpm build` exit 0; Prettier `--check` clean on the changed files (the two source files were clean at `HEAD`); the catalogue verifier 860 rows, 0 missing.
- **Failing first, the API spec**, on the unfixed code (`src` as on `dev`): **6 failed, 1 passed** (the `setup` project). In all six, `count` and `channel` already matched and the only difference was the missing `withoutAddress` (expected 2, 2, 1, 0, 0 and 2), which is the finding: the answer does not say who was left out. A first run of this spec and of the browser spec failed in my fixture, not in the product (the database accepts a guardian's phone number only as digits and `+ ( ) -`, and I had put letters from the tag in it); the numbers were made digits and the specs rerun.
- **Failing first, the browser spec**, on the unfixed build, desktop and phone: **4 failed, 1 passed** (the setup), each of the two tests for its own reason: no alert saying "Nothing was sent" (the page showed a green "queued successfully for 0 recipients"); and the composer's tab had **switched to the delivery log** (`aria-selected` of "Broadcast Composer" was `false`). A first version of the second test began by asserting the warning, so it failed there and could not say whether the tab and the text were also wrong; it was reordered (wait for the confirm dialog to close, then the tab, the text and the queue) before the record was taken.
- **The fixed build:** `unit` **1267 passed**; `api` (the new spec, `communication-campus`, `communication`, `communication-queue`, `communication-tags-recipients`): **38 passed, 0 failed**; browser, desktop and phone, `TEST_TIMEOUT_SCALE=2` (the new spec, `communication-campus`, `communication`, `communication-composer-tags`, `communication-batches`): **31 passed, 0 failed, 0 skipped, 0 flaky**. The two new browser tests ran on both viewports, with axe and overflow in both themes with the warning showing.

**Not run, and not claimed:** `integration` and `https` projects, the whole suite, the whole responsive spec (the new spec runs axe and overflow in both themes on the screen that changed), mutation passes (deferred to the end of PHASE 2). **No migration, no environment change.**

**For the maintainer (open, not changed):** the partial case (some of the audience skipped) is still silent, because the composer is replaced by the delivery log at that moment; `withoutAddress` is in the answer for when a place for the note is chosen (D4). The system messages sent by events skip a guardian with no phone or email without a trace (section 4).
