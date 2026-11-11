# 0047: The promotion screen says how many pupils have no published marks for the last term (decision D8 of task 0031)

- **Period / Focus:** 2026-11-11 (the maintainer approved D8 on 2026-11-11: keep the final-term check as advice and name how many pupils are affected)
- **Status:** Built and tested; PR into `dev`
- **Priority:** Low
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-promotion-advice` / PR into `dev`
- **Started:** 2026-11-11

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

When an administrator previews a class to roll, and again in the confirm dialog, the screen says how many pupils on the roll have no published marks for the session's last period, so they can publish the term's results first if they want them counted. Nothing is blocked: the roll goes through exactly as before.

## 2. Context

- A pupil's average counts only results the school has stood behind (PUBLISHED or LOCKED), term by term; a term with nothing published is left out of the mean, not counted as zero (task 0031). A pupil with nothing published for the last term is therefore judged on the earlier terms, and a pupil with nothing at all is advised to repeat.
- `validateSessionPromotionEligibility` already gives advice when the session's current period is not its last. The decision D8 was whether an unpublished final term should block a promotion. The maintainer chose to keep it as advice: undoing a roll (task 0040) exists, so a mistaken roll costs one undo.
- The preview (`previewPromotion` in `src/lib/promotion/service.ts`) already holds each pupil's per-term averages (`null` = nothing published) and whether the pupil already has a place in the next session (a roll leaves them alone).
- The promotion screen's client code may not import anything that pulls in `@prisma/client` (the page's policy refuses it), so the pure rule goes in `src/lib/promotion/choices.ts`, which has no imports, and `rules.ts` re-exports it for the server.

## 3. Decisions

- **D1. Advice, never a refusal.** No status code changes and no route refuses. The preview carries `finalTermGap: { ordinal, label, pupils } | null`; the screen shows it in a warning where the "not the last period" advice already is, and again in the confirm dialog, with "You can still go on".
- **D2. Who is counted.** Pupils on the roll who have no place in the next session yet (a pupil already placed is left alone by the roll, so is not affected) and no published or locked result for the session's last period (the highest ordinal), in any subject. A pupil with any published mark for that period is not counted, however many subjects are missing: the question is whether the term has been published for them at all.
- **D3. The last period is the highest ordinal** of the session's live periods, as the existing eligibility advice defines it; a session with no periods has no gap.
- **D4. No new field in the roll's request or the batch.** The advice is not recorded in the batch: it is a prompt for the person at the screen. The audit rows are unchanged.
- **D5. No migration, no new route.**

## 4. Work breakdown

- [x] Design (this file).
- [x] `finalTermGap` and `finalTermGapText` in `choices.ts`, re-exported by `rules.ts`; the preview carries `finalTermGap`; the client `Preview` type.
- [x] The panel shows it in the preview and in the confirm dialog.
- [x] Tests: unit (the rule, the sentence), API (the preview), browser (the two places), mutation check, regression.
- [x] Docs: HANDOVER, tracker, CLAUDE.md banner, the functions catalogue and the promotion rows, task 0031's decision D8.

## 5. Not in this task

- Blocking a roll, or an option to block it: the maintainer chose advice.
- Counting per subject, or naming the pupils (the count is the advice; the table already shows each pupil's term averages with "No published term scores").
- Offering to publish the term from the dialog.

## 6. Build record and tests

**Built on** `claude/octalve-promotion-advice`. No migration, no new route, no change to a request or a status code. New: `finalTermGap` and `finalTermGapText` in `src/lib/promotion/choices.ts` (still no imports: the browser runs it), re-exported by `rules.ts`. Changed: `previewPromotion` in `service.ts` returns `finalTermGap`, the client `Preview` type in `model.ts` carries it, and `PromotionPanel.tsx` shows it in a warning in the preview and as one line in the confirm dialog ("You can still go on: publish the term's results first if you want them counted").

**What the build found.** Nothing wrong in the code it touches. One mutation (N7) did not build the first time, because TypeScript refused `false && ...` as a dead branch; it was redone with a cast.

**Tests.**
- Unit `promotion-final-term` (new, 6 tests): who is counted (nobody already placed in the next session, nobody with a published mark for the last period, however many earlier periods they have), the last period is the highest ordinal whatever the order of the list, a mark of zero is a mark, nobody missing or no periods or no pupils gives `null`, the sentence for one pupil and for several, and that `rules.ts` re-exports the same function for the server.
- API `promotion` (extended): the preview of the seeded class says `{ ordinal: 3, pupils: 3 }`, and a second test where every pupil has a published last-term mark says `null`, and where one pupil is missing says 1.
- Browser `promotion-screens` (extended): the preview shows the sentence and the "Review and roll" button stays enabled (advice, not a refusal), and the confirm dialog shows the sentence again.
- **Mutation check:** nine changes, each applied alone to a copy of the code in a test lane (20 tests on the unmutated code for the unit and API specs; 42 for the run with the browser spec). Every one is caught:

| | Change | Failed |
| --- | --- | --- |
| N1 | a pupil already placed in the next session is counted | 1: "a pupil who already has a place ... is not counted" |
| N2 | the FIRST period instead of the last | 3: the count test, the already-placed test, "the last period is the highest ordinal" |
| N3 | a missing average counted as 0 (so never missing) | 3: the same three |
| N4 | returns a gap with 0 pupils instead of `null` | 2: the already-placed test, "nobody missing ... is null" |
| N5 | the sentence says "1 pupil have" | 1: "one pupil and several are each grammatical" |
| N6 | the preview always answers `finalTermGap: null` | 6: two API tests, and both browser tests on desktop and phone |
| N7 | the preview warning is never shown | 2: "the administrator picks a class and reads what the rule advises", desktop and phone |
| N8 | the confirm dialog's line is removed | 2: "changing a decision needs a reason; the roll is confirmed ...", desktop and phone (N7 and N8 each fail a different test, so the two places are held apart) |
| N9 | no check for a session with no periods | 1: "... nobody missing, no periods or no pupils is null" |

**Static gates:** `tsc --noEmit` clean, `eslint` clean on the eight changed files, Prettier `--check` clean on them and on this file.

**Regression.** A clean build in a test lane, then the whole `unit` and `api` projects and four browser specs (`promotion-screens`, `promotion-streams-screens`, `promotion-undo-screens`, `academics`), each on desktop and phone.
- Unit and API: **2,882 passed, 2 failed, 4 did not run.** Both failures were tests that send many requests at once, and this run shared one database server with three other test lanes: `finance.spec.ts:349` ("20 simultaneous fulfilments") failed with `Too many database connections opened: FATAL: remaining connection slots are reserved for roles with the SUPERUSER attribute` (the four tests that did not run are the rest of that file, which stops after a failure), and `portal-practice.spec.ts:159` ("two answers to one question sent together") got a 500 where it expects a 400; I did not read a connection message for that one, so I do not claim it was the same cause. Run on their own straight afterwards on the same build, `finance` and `portal-practice` passed in full (25 of 25).
- Browser: **43 passed, 0 failed.**

**Not tested, and not claimed.** No deploy. A roll with several thousand pupils (the count is a filter over rows the preview already holds). The advice is not stored in the batch, so nothing records that the school was told.
