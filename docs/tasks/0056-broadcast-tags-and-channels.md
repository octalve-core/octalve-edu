# 0056: The Broadcast Composer's tags are filled in, what cannot be sent is refused, and a message nobody can read is not queued

- **Period / Focus:** 2026-11-12 (the sibling of AlEemaan's task 0055 and PR #177: found while checking the words of the info icons and fixed on the maintainer's standing instruction)
- **Status:** Done
- **Priority:** High (a guardian receives the text `{{class_arm}}` as it stands, while the composer's preview showed them a pupil's name)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/communication-tags-recipients` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

What a person types in the Broadcast Composer is what the recipient reads, and the screen only offers what can work. Read from `src/lib/communication/service.ts` (`createBroadcast`), `http.ts` and the two screens that post to it:

1. **All four "Available Dynamic Tokens" are never filled in.** `createBroadcast` queues `body: input.body` as typed and nothing in the dispatcher, the worker or the queue code calls `interpolateTokens` (the event triggers do, for their own templates; the Broadcast does not). A guardian would receive `{{student_name}}` as text. **The composer's live preview made it worse**: it replaces the tokens with made-up samples ("Tariq Nasir", "Primary 4 Gold"), so the person saw a finished message.
2. **The In-App channel queues a message no screen shows.** Nothing in the app reads a dispatch back to a person; Announcements are this product's in-app feed (`AnnouncementsFeed`). The same kind of lie as AlEemaan's.
3. **The Students audience of the Quick Broadcast tool reaches nobody.** The API accepts `audienceRole: "STUDENT"` and `createBroadcast` has no branch for it, so it answers "queued for 0 recipients".

4. **Found while testing the fix, not by reading: on a phone the Communication page is 16 px wider than the screen.** The three tabs ("Broadcast Composer", "Notification Templates", "Delivery Logs & Diagnostics") did not fit side by side at 412 px: the last one ended at 427 px, so the whole page scrolled sideways and Chrome widened its layout viewport (428 px) to fit it. It was in `CommunicationPanel.tsx` before this task and nothing here touched it. See D9.

Not a defect here (checked, unlike AlEemaan): the address is chosen per channel and audience (email, or the phone for SMS and WhatsApp, for guardians and for staff alike).

## 2. Context

- This is the Octalve half of AlEemaan's task 0055. Read its design record for the reasoning behind each rule; the differences are below.
- Nothing consumes the dispatch queue (task 0054, section 5: the options A, B and C are the maintainer's to choose), so no broadcast is delivered in any case today. That does not change this fix: the text that is queued must be right the day a worker exists, and the screen must not offer what can never work.
- Data available: the school's name is `Tenant.name` (what the event triggers use as `school_name`); the school's own time zone is `readSchoolTimeZone(tx, tenantId)`; a guardian's children are the guardian's `GuardianLink`s with status `APPROVED`; a child's class now is the `StudentEnrollment` of the ACTIVE session (`classArm` with its `classGroup`); a staff member's address is the `StaffRecord`'s own email and phone.
- Unlike AlEemaan, one guardian record can have several children, so a tag can name more than one pupil.

## 3. Decisions (mine; the maintainer may correct)

- **D1. One pure module** (`src/lib/communication/tags.ts`, no database) says which tags exist for whom: guardians can use `student_name`, `class_arm`, `school_name`, `date`; staff only `school_name` and `date`. For the audience "All Community" (guardians and staff), a tag is fillable only if it is fillable for both, so the pupil tags are not offered and are refused there. The composer and the input check read the same table.
- **D2. The server fills them, per recipient.** `school_name` is `Tenant.name`; `date` is today in the school's time zone, "12 November 2026"; for a guardian, `student_name` is the names of the guardian's approved, non-archived children ("Amina Bello", "Amina Bello and Ibrahim Sani", "A, B and C"), only those in the chosen class arm when one is chosen; `class_arm` is their classes in the ACTIVE session ("Year 1 A", joined the same way, each class once), and "their class" for a guardian none of whose children has one; a guardian with no linked child gets "your child" for `student_name`. Values go through `interpolateTokens`, which HTML-escapes them for EMAIL.
- **D3. A tag that cannot be filled is refused, not queued**, in the input check (the same Zod schema the route uses): 400 with the tags and the audience named, and nothing is created. The refused set also covers `{{due_date}}` and any other name.
- **D4. In-App is refused** (400, "In-App messages are sent from Announcements: nothing here shows them to the person."), and its button leaves the composer and the Quick Broadcast tool. Old In-App rows, the log's filter and templates that name the channel are untouched. **A decision the maintainer may reverse**, as in AlEemaan: the alternative is a notification feed, which is a feature.
- **D5. The Students audience is refused** (400, "Students are reached through their guardians: send to Parents / Guardians."), and leaves the Quick Broadcast tool.
- **D6. The live preview says what it is.** It keeps its sample values (a preview needs something to show) and now says "Sample values: each recipient gets their own."
- **D7. The two info icons held back in task 0055** (`communication.channel`, `communication.tags`) are added, in the words of D1 and D2, each checked against the code. The channel tip says what the address is chosen from, not that the message is delivered (nothing delivers until the queue has a consumer).
- **D8. Not in this task.** The worker (task 0054); the "Queued" status tip; siblings: one guardian record with several children gets ONE message naming all of them (that is the point of D2); mutation passes are deferred to the end of PHASE 2 (the maintainer's call).
- **D9. The tab strip fits a phone** (`CommunicationPanel.tsx`): `px-2` instead of `px-3.5` and `space-x-1` instead of `space-x-2` below the `sm` breakpoint, and `overflow-x-auto` on the strip, so a screen narrower than 412 px scrolls the strip and not the page. This is the pattern `SectionTabs` already uses. The saving is 44 px, the overflow was 15 px. A spec checks every tab's page width against the VISUAL viewport (the layout viewport grows with the overflow, so `innerWidth` could never fail); it fails on the phone against the old strip.
- **D10. The info icon's touch area is 24 px here too** (`InfoTip.tsx`; AlEemaan task 0056 has the reasoning). **This was NOT what fixed the failing phone runs of this task.** My first reading of them (a chip click "intercepted by the info button") was wrong: the interception continued with the 24 px area, and the real cause was D9's overflow, which put Chrome's visual viewport out of step with the coordinates Playwright clicks. The smaller area stands on its own evidence (AlEemaan's spec shows the old 44 px area overlapping a neighbour by 8 px in four places there), not on this one.

## 4. Work breakdown

- [x] Design (this file).
- [x] `tags.ts` and the rules in `createBroadcastSchema` (D3 to D5).
- [x] `createBroadcast` fills the tags per recipient (D2).
- [x] Composer (chips by audience, no In-App, sample note) and the Quick Broadcast tool (no In-App, no Students); the two info icons.
- [x] The tab strip fits a phone (D9) and the icon's touch area is 24 px (D10).
- [x] Tests: unit (tags, the schema), API (filled bodies for one child, several children, a guardian with none, a class arm that narrows the children, staff; the refusals create nothing; EMAIL escapes), browser (chips per audience, no In-App, a refused tag shown with the text kept, no tab wider than the screen, the new icons in `info-tips.spec.ts`).
- [x] Docs: tracker (with the In-App decision left to the maintainer), the function and component catalogues.

## 5. Not in this task

- The queue worker; real delivery (no key exists to try it with); a notification feed; the walkthrough.

## 6. Build record and tests

Filled in from the logs of 2026-11-12 (lane 1, a production build of this branch, its own database).

**Gate:** `tsc --noEmit` exit 0; ESLint on the 13 changed source and test files, no findings; `prettier --check` on them and on this file, clean (after `--write` on the new browser spec); `pnpm build` in the lane, compiled and all 35 static pages generated.

**Run 3 (after the fix to D9): 171 passed, 0 failed, 4 skipped, 4.2 minutes.** The four skipped are the device-only tests of `info-tips.spec.ts` (a phone has no hover; desktop has no tap). By project: unit 66, api 20, e2e-desktop 43, e2e-mobile 41, setup 1. By file: `tests/unit/communication-tags.spec.ts` 13, `tests/api/communication-tags-recipients.spec.ts` 11 (one child; several children; a class arm narrows the children; the subject is filled and EMAIL is HTML-escaped; staff and the whole community; no tag is queued as typed; six refusals that queue nothing), `tests/e2e/communication-composer-tags.spec.ts` 10 (5 tests on desktop and phone), `tests/e2e/communication.spec.ts` 2, `tests/e2e/info-tips.spec.ts` 24, plus the existing communication, quick-tools, academics and people specs, unchanged. Then, after the touch-area check in `info-tips.spec.ts` was made geometric (see below), `info-tips`, `communication-composer-tags`, `communication` and the unit `info-tips` again: **42 passed, 0 failed, 4 skipped.**

**What the failed run taught (run 2: 165 passed, 4 failed).** The four were all on the phone, all on the Communication screen: two clicks in the new composer spec timed out at 2 minutes ("intercepts pointer events"), and two `info-tips` tests failed (a click, and "opening the tip does not scroll the page: expected 7, received 0"). I first blamed the info icon's touch area (run 1's reading, D10) and that was wrong: the interception continued with the smaller area. A throwaway debug spec logged, at each step, the scroll, the visual viewport and what is under the click point. It showed `scrollWidth` 428 against `clientWidth` 412 **on the loaded page**, before anything was opened, and a second listing named the culprit: the third tab ended at 427 px. With the page overflowing, Chrome's visual viewport sat 16 px right and 31 px down of the layout viewport, so what Playwright clicked was not what was under it. D9 fixes the tab strip; the debug spec was deleted. This is a real defect a person on a phone would have seen (the page moves sideways under a finger), found only because the new spec clicks things on a phone.

**Regression proofs actually run.**
- The new "no tab wider than the screen" spec against the OLD tab strip (a build from before the fix): passes on desktop, **fails on the phone** ("the Broadcast Composer tab makes the page wider than the screen"). Against the fixed build: passes on both.
- The unit spec against the OLD `http.ts` (put back from `HEAD` in the lane, then restored and compared byte for byte): **4 of 13 fail** (In-App refused, Students refused, an unfillable tag refused, the order of the rules), and the 9 that test the new pure module pass, as they should.
- Not run: the API spec against the OLD `createBroadcast` (it would need a rebuild; its assertions are exact filled strings, so an unfilled body cannot pass them); the touch-area check against the old 44 px area in THIS repo (done in AlEemaan's, where the same component and the same check fail on four places with 44 px and pass with 24 px).

**Not run:** the whole suite; mutation passes (deferred to the end of PHASE 2, the maintainer's call); the Solo-mode server; a real phone, a real screen reader, a real send (no provider key, and nothing consumes the queue: task 0054, section 5).

**Left open for the maintainer:** In-App was refused (D4); bringing it back as a real notification feed is a feature and their call.
