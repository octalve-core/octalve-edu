# 0025: The Forms and question-bank screens (the APIs are on `dev`; the screens were not)

- **Period / Focus:** requested 2026-11-02 (the maintainer: "implement every item ... for both AlEemaan and Octalve")
- **Status:** In progress (plan written 2026-11-02; slice O6 built, O1 to O5 and O7 not)
- **Priority:** High (Octalve's walkthrough waits for it)
- **Assignee:** next AI / maintainer
- **Target Branch / PR:** one branch per sitting, off `dev`; the PRs are cut slice by slice when each slice is tested

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
Every route of the Forms module and the question bank's reports, printing and offer-back has a screen a person can reach by clicking, with the same rules as AlEemaan's (task 0041 there; the screens are the same product): a teacher sets and marks practice sets, questionnaires and paper work, a pupil takes them and practises, anyone with the link answers a public questionnaire, a reviewer handles reports on questions. Nothing about who may see what changes: the APIs decide (task 0024 and the parity note); the screens only show it.

## 2. Context & what was found
- **Correction (2026-11-02).** An earlier note said Octalve had no Forms module. That came from reading a checkout 28 commits behind. `origin/dev` (e39bd56) has the whole backend: `src/lib/forms/` (practice sets, questionnaires, paper work, marking), `src/lib/question-bank/` (items, reviewers, settings, practice, reports, regrade, printing, assessments), the routes under `/api/v1/schools/[code]/forms`, `.../portal/forms`, `.../portal/practice` and `.../question-bank`, and the migration `20261102120000_forms_and_question_bank_parity`. What it lacks is the screens: only Browse, My questions, Review queue, Reviewers and Settings exist.
- **Design source:** AlEemaan's `docs/tasks/0041-forms-screens.md` (the six rules every screen keeps) and its `src/components/forms/`, `src/components/portal/`, `src/components/question-bank/` (the ports start from those components, adapted to Octalve's API shapes below).
- **Differences that shape the port.** (1) Routes are `/api/v1/schools/[code]/...`; the campus is the caller's own (`auth.tenant.campusId`), so no screen sends a branch. (2) A pupil signs in with their own account (`STUDENT`), there is no portal session, and Octalve's navigation shows a pupil only Overview today: the pupil's screens need a page and a navigation entry. (3) The print routes answer with the PDF itself, not JSON (`format: json` does not exist). (4) The print log has no paging (a limit of at most 100). (5) A report's list has no `itemVersion`. (6) The offer-back route takes no `quizId` (the question id is enough). (7) The quiz list in the LMS panel carries counts only; a quiz's questions come from `GET .../lms/quizzes/[id]`.

## 3. Work breakdown
### Slice O6: Question bank: reports, printing, offer-back (the first, because the bank screens already exist here)
- [x] "Report a problem" on an approved question someone else wrote (`ReportProblemDialog`), a Reports tab for reviewers (`ReportsPanel`, `AnswerReportDialog`: outcome, reason, the correction of copies and attempts for Fixed), Print on a question (`PrintDialog`, `pdf.ts`), a Print log tab (`PrintLogPanel`), and "Questions" on an LMS quiz card (`QuizQuestionsDialog`: offer a question back to the bank, print the quiz).
### Slice O1: Staff forms (`/schools/[code]/forms`): list, create, publish, close
- [ ] Practice sets, Questionnaires, Paper work, For you; the builder per kind; the public link once a public questionnaire is published
### Slice O2: A form's page, marking and the paper-work roll call
- [ ] Overview, Questions, Results, Marking, Roll call, Print
### Slice O3: The pupil's Forms (a page for pupils: `/schools/[code]/learn`, navigation entry "My work")
- [ ] Practice sets with the server-timed countdown and the result, questionnaires, paper work and "Request marking"
### Slice O4: The pupil's question practice (a Practice tab on the same page)
- [ ] Setup, one question at a time, history, reports; a parent account's summary or history by the school's `bank.parents.view`
### Slice O5: The public questionnaire page
- [ ] `/q/[code]/[token]`, signed out, noindex and no-referrer
### Slice O7: Small things
- [ ] A link to `/video-guide` from the profile menu; a configurable address for the video; `distDir` from `NEXT_DIST_DIR`

## 4. Definition of done (every slice)
The e2e specs for the slice (desktop and phone, axe in both themes), then tsc, eslint, build, tests in that order; the component and page catalogs (`verify_catalogs.py`) updated; this file, HANDOVER and `current-tasks.md` updated; PR into `dev` with `base.ref` verified and the exact "Vercel" check green before the guarded merge. The maintainer asked on 2026-11-02 for all the implementation first and then each slice tested in turn, so the specs are written in the test phase.
