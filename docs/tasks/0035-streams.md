# 0035: Streams — a pupil goes to the stream the school chooses when a class is rolled

- **Period / Focus:** 2026-11-10 (promotion, the part task 0031 left open: "a school with streams needs a way to say which stream a pupil goes to")
- **Status:** Built; PR into `dev`
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-streams` / PR into `dev`
- **Started:** 2026-11-10

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

> **Migration note (task 0049, 2026-11-11):** `20261123090000_promotion`, `20261124090000_streams` no longer exist as folders: the six migrations that were waiting for a hosted database were merged into one, `20261122090000_progress_promotion_results`, with the same schema (`docs/tasks/0049-squash-pending-migrations.md`). The text below is the record of what was built then and keeps the old names.

---

## 1. Objective

After a common class (JSS3) a school splits its pupils into streams (SS1 Science, SS1 Arts, SS1 Commercial). Task 0031 rolls every promoted pupil into ONE class, chosen the same way every time, so a school with streams had to move most pupils by hand afterwards. This task lets a class say which stream it is, makes a pupil stay in their stream when they move up, and makes the administrator say where a pupil goes when the stream cannot be worked out.

## 2. Context

- Two classes that share a `sortOrder` are "parallel streams" (task 0031, `resolveNextClassGroup`): neither is the next class of the other, and when several share the NEXT rung the roll picks one deterministically (the campus's own, then by name). Nothing says what a stream IS.
- `ClassGroup` has no stream. The progression is a rung number; the class name is free text ("SS1 Science").
- A roll is `executePromotion` (`src/lib/promotion/service.ts`): preview, per-pupil overrides (a decision other than the advice, with a reason, and optionally an arm), then one transaction that writes the new enrolments and an append-only batch.

## 3. Decisions

- **D1. A stream is a label on a class, not a new table.** `ClassGroup.streamName` (nullable text, trimmed, 1 to 40 characters; the database checks it). `null` means "no stream", which is every class that exists today, so nothing changes for a school that has none. Nothing forces the streams of one rung to be different: if two classes of the same ladder and rung carry the same stream, the stream does not pick one of them and the pupil is asked about (D3).
- **D2. A pupil stays in their stream.** When the next rung has several live classes: if the pupil's class has a stream and exactly one live class on the rung has the same stream (case-insensitive), that is the target. (A campus's pupil is matched against the classes of their own ladder: the campus's own classes and the school-wide ones, with the campus's own first, exactly as the progression already does; if both a campus class and a school-wide class carry the stream, the campus's own is the one.)
- **D3. When the stream cannot be worked out, the roll asks.** The rung has more than one live class, at least one of them has a stream, and the pupil's own class has no stream or none on the rung matches: the pupil `needsPlacement`. The roll is REFUSED (409, before the first write) while a pupil who is to be promoted needs a placement and none was given. A rung with several classes and no streams at all keeps today's behaviour (the deterministic pick), because there is nothing to ask about.
- **D4. A placement is not an override.** An override is a departure from what the rule advises and needs a reason. Choosing the stream of a promoted pupil follows no rule to depart from, so it is its own list: `placements: [{ studentId, classGroupId }]`. Strict schema; at most one per pupil; the pupil must be on the roll and end up PROMOTED; the class must be a live class of the NEXT rung of the same ladder (never any class of the school: that would be a way to skip a year or cross a campus). The arm is the one with the pupil's own arm name in that class, else its first arm (as for any promotion), unless an override names an arm, which must then belong to the placed class.
- **D5. Evidence.** `PromotionRecord.targetClassGroupId` (nullable, composite foreign key) records the class each pupil was placed in, since a batch can now have several. Old rows are null (the batch's `targetClassGroupId` applies). The table stays append-only. `PromotionBatch.targetClassGroupId` is the DEFAULT target the preview showed (the existing "has the target changed since the preview" check keeps working).
- **D6. No new permission.** Setting a stream is editing a class: the roles that may edit a class (administrator; a campus administrator for their campus's classes) may set it; it is audited with the existing `CLASS_GROUP_UPDATED`.

## 4. Work breakdown

- [x] Migration `20261124090000_streams`: `ClassGroup.streamName` with its check; `PromotionRecord.targetClassGroupId` with its composite foreign key. Prisma schema.
- [x] Rules (`src/lib/promotion/rules.ts`, pure): the rung's classes, the stream-aware pick, `needsPlacement`.
- [x] Classes: create and edit take `streamName`; the view returns it; the sentence for a bad one.
- [x] Promotion: preview returns the rung's classes, each pupil's target class and `needsPlacement`; execute takes `placements` and refuses as D3 and D4 say; records the class per pupil.
- [x] Screens: the class dialog has "Stream (optional)"; the roll screen shows a "Goes to" choice per pupil when the rung has several classes, a "Set all" shortcut, and holds the Roll button while a pupil needs a choice.
- [x] Tests: unit (rules), API (the roll with streams, every refusal), the roll screen on desktop and phone in both themes.
- [x] Docs: tracker, HANDOVER, the catalogues, `tests/README.md`.

## 5. Not in this task

- Moving a pupil between streams within a session, or a stream history of a pupil (the enrolment already says the class).
- Subject choices by stream (which subjects a stream studies are the class's offerings, as now).
- Undoing a roll (task 0040).

## 6. Build record and tests (2026-11-10)

**What changed.** Migration `20261124090000_streams` (two nullable columns and three constraints: no existing row changes); `src/lib/promotion/rules.ts` (`nextRungClasses`, `streamPlacement`; `resolveNextClassGroup` keeps its shape and answer), `validation.ts` (`placements`), `service.ts` (preview: `rungClasses`, `placementNeeded`, per-pupil class and `needsPlacement`; execute: `checkPlacements`, per-class arms, the class recorded per pupil); `src/lib/academics/classes.ts`, `http.ts`, `sessions.ts` and the two class-group routes (`streamName`); the class dialog, the classes list, and the roll screen (`PromotionPanel`, `PromotionPreviewTable`, `model.ts`: a "Goes to" choice per pupil, "Place every pupil who is moving up in", the roll held while a pupil has no class, the confirmation naming how many go to each class). No new route, no new permission.

**Deployment.** Run `20261124090000_streams` on the hosted databases after `20261123090000_promotion`. It is additive and the release before it never reads either column, so it can run before the code is deployed. The maintainer runs it; an AI session never does.

**Gates (order tsc, lint, build, tests).** tsc clean; eslint 0 errors (the warnings that exist are in files this task did not touch); `pnpm build` OK; Prettier clean on every file changed.

**Tests (one lane, one worker, the production build).**
- Unit `promotion-streams` (13, new): the rung, every way a stream picks a class or fails to.
- API `promotion-streams` (16, new): the class takes, trims, changes and clears a stream and refuses a bad one (and the database refuses what the application would not write); the preview for a stream class, for a class moving into streams, for a rung with no streams (unchanged behaviour) and for two classes carrying one stream; the roll that refuses to guess (nothing written, the sentence names the pupils), the split between streams with the arm by name and the class recorded per pupil, a placement where nothing forces one, an arm chosen by hand that must belong to the placed class; every refusal of a placement (not the next rung, archived, another school's, unknown; a pupil who repeats, who is not on the roll, who already has a place; twice; an arm-less class; a caller who may not roll).
- Screens `promotion-streams-screens` (4 tests, desktop and phone = 8, new): the class dialog and list; a class moving into streams (each pupil needs a class, the roll is held, the confirmation names the classes); "place every pupil"; a stream class rolling into its own stream without asking. Axe (WCAG 2.2 A/AA) and horizontal overflow in both themes.
- **Regression:** the whole `unit` and `api` projects: **2,614 passed, 0 failed (19.5 minutes)**, including every earlier promotion and class test unchanged. The browser specs for promotion and academic setup (`promotion-screens`, `academics`) with the new ones: 37 passed.
- **Mutation check.** In a copy, four rules were broken (the roll guesses instead of asking; any class of the school accepted as a placement; a placement accepted for a pupil who is not promoted; the stream ignored). After a rebuild **15 of the new tests failed**, each mutation caught by name; the copy was restored.
- **Not run:** the rest of the browser suite, the HTTPS project, anything against a hosted database, the migration on a hosted database.

**Left for the maintainer.** Streams are labels on classes; a school that names none sees no change. A school should name the streams of its classes (under Classes and subjects) before the next roll for the question to be answered for it.
