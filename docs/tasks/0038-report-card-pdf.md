# 0038: PDF report cards — one pupil's card, or a whole class's, as a file; and a real page to check a mark

- **Period / Focus:** 2026-11-10 (report cards; follows AlEemaan's report-card export, as a real PDF, with Octalve's access rules)
- **Status:** Built; PR into `dev`
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-report-card-pdf` / PR into `dev`
- **Started:** 2026-11-10

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Let staff download a report card as a PDF file, one pupil's or a whole class's in one file, and let a pupil or parent download their own. The file says what the card on the screen says and no more. Along the way: the card told people to check a mark at `/api/v1/verify/<code>`, which is a raw JSON address, not a page and not a full link. This task gives that check a real public page and prints full, clickable links.

## 2. Context

- The card is `getStudentReportCard` (`src/lib/results/service.ts`), with the rules of tasks 0031 (who reads whose, pupils and parents see published results only), 0036 (remarks) and 0037 (the payment gate). The class list is `classRoster` (`sheet.ts`).
- AlEemaan's export (`src/lib/academics/report-card-export.ts`) writes a self-contained HTML card whose verification links are `<origin>/verify/<token>`; the address shape here is the same. Octalve already has a small hand-written PDF writer for the question bank (`printing.ts`, Latin-only, built for question papers). A report card needs real text measuring, a table that continues across pages and several cards in one file, so this task adds a writer of its own (`src/lib/pdf/builder.ts`) instead of stretching that one, and adds no dependency.
- The public lookup `GET /api/v1/verify/[token]` (never cached, never indexed, no admission number: issue ISS-0008) returns the school, the pupil's name, the term, the subject and the grade for a PUBLISHED or LOCKED result. It is JSON. `VerifyCertificateForm` was meant to be its page but no page ever mounted it. The card (screen, from task 0031) and the first draft of this PDF both told the reader "Anyone can check a published mark at /api/v1/verify/<code>."; the maintainer saw it and asked whether people are meant to see an `/api/v1/` path and whether it should be a full link. It is a defect: fixed here (D8 to D11).

## 3. Decisions

- **D1. The PDF is built from the same read as the screen.** `singleCardPdf` calls `getStudentReportCard`; `classCardsPdf` calls `classRoster` (the class list's access rule) and then `getStudentReportCard` for each pupil. So every rule of the card applies to the file with no copy of it: a pupil or parent held by the payment gate gets the same 403 and no file; a pupil or parent is given PUBLISHED and LOCKED results only; remarks follow the card's visibility rule; staff get every status and the page says "Not official: some of these marks are not yet published." when any mark is not.
- **D2. Who may download what.** One pupil's card: the roles and the `studentAccess` check of the card route (an administrator, staff within their reach, the pupil themselves, a parent of the pupil). A class: staff only (the class list's roles: not a pupil, not a parent; a teacher only the arms they teach, everyone else the same 404 as an unknown class). A pupil or parent downloads their own single card.
- **D3. A class file holds at most 100 cards.** 409 `TOO_MANY_CARDS` with "This class has N pupils; a file holds at most 100 report cards." and no file. The file is built in memory in one request; an empty class is a 404 "Nobody was on the roll of this class for this term."
- **D4. Audited.** `REPORT_CARD_PDF_DOWNLOADED` (target the pupil) and `REPORT_CARDS_PDF_DOWNLOADED` (target the class arm) with who, the role, the term, the number of pupils and pages. A report card is personal data; every download is on the record. Not the contents.
- **D5. Limits and headers.** 60 single downloads and 20 class downloads per user per window (`reserveAttempt`). The response is `application/pdf`, `Content-Disposition: attachment`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and `X-Report-Card-Unsupported-Characters` (how many characters the fonts could not draw). The file names are plain ASCII: `report-card-<admission no>-<term>.pdf` and `report-cards-<class>-<arm>-<term>.pdf`.
- **D6. The writer.** PDF 1.4, A4, the standard Helvetica and Courier fonts (no embedding), WinAnsi encoding, text written as hex strings (so no character can break the file), a real cross-reference table, the document title/author in the information dictionary, deterministic (the same input and clock give the same bytes). Text is measured with the Helvetica width tables for U+0020 to U+007E so wrapping is true, not guessed. **Limitation, on purpose:** WinAnsi covers Latin-1 and the Windows-1252 punctuation. A letter with a mark WinAnsi lacks (Yoruba ẹ, ọ, ṣ and the tone marks) is written as its base letter, a lone mark is dropped, and a character from another script (Arabic, Chinese, an emoji) is a `?` and is counted in `X-Report-Card-Unsupported-Characters`. Nothing is silently lost without a count. Embedding a Unicode font would lift this and is a decision for a later task (a font file in the repository, its licence, the size of every file).
- **D7. The layout.** Header (school, "Term report", session and term); a panel with the pupil, admission number, class and position; three boxes (total, average, "On track" or "Below the mark"); the subject table with its column heads repeated on every page and "Report card of X (continued)" on each continued page; the remarks in boxes that continue across pages rather than run off the bottom; a footer with the school, the date and "Page i of n" on every page. Each pupil starts on a page of their own; a card that spills over does not share its last page with the next pupil.
- **D8. A real page to check a mark.** `/verify/[code]` (the address printed on the card) opens straight onto the answer; `/verify` takes a typed or pasted code (the bare code, in any case, or the whole link). Public, signed out on purpose, `force-dynamic`. The code is the whole secret of the lookup, so both pages are `robots: noindex, nofollow` and `referrer: no-referrer`, as the public questionnaire page is. The pages read the answer from the existing public API, which already limits attempts per IP and says `noindex` itself, so the rules of the lookup are in one place. The answer shows the school, the pupil, the session, the term, the subject, the grade and the date; never the score and never the admission number (the API never gave them).
- **D9. A full link on the card and in the PDF.** Each published mark shows `https://<this site>/verify/<code>`: on the screen a real link (opens in a new tab, `rel="noopener noreferrer"`, "opens in a new tab" for screen readers) and in the PDF a clickable link annotation, underlined, in the colour links have. The note says "or go to https://<this site>/verify and type the code at the end of the link", so a printed card can be checked by typing. A mark that is not published has no link. The raw API path is no longer shown anywhere a person reads.
- **D10. Where the address comes from.** On the screen, the address the page was opened on. In the PDF, `APP_URL` (the deployment's own setting: the sign-in cookie and the e-mails already use it), else the address the request came in on, else the development address (`src/lib/app-url.ts`). A value that is not an `http(s)` address is not used. A link annotation is only written for a plain printable-ASCII `http(s)` address: anything else is left as plain text, so a malformed setting can never produce a broken file (the builder also escapes `(`, `)` and `\` inside the address).
- **D11. The unused `VerifyCertificateForm` is removed.** It was never mounted, was named for something it did not do (vocational certificates) and used a fixed palette; `VerifyCredential` replaces it with the app's own colours.
- **D12. No support `area`.** A download writes an audit row, so the routes declare none, like every state-changing route (a support session is read-only).
- **D13. No pupil or parent screen.** There is still no results screen for a pupil or parent; they meet the PDF through the API, as they meet the card and the gate (tasks 0031, 0037).

## 4. Work breakdown

- [x] `src/lib/pdf/builder.ts`: the writer (text measuring, wrapping, WinAnsi, pages, links, cross-reference table).
- [x] `src/lib/results/report-card-pdf.ts`: the layout (pure: it draws the data it is given).
- [x] `src/lib/results/report-card-pdf-service.ts`: one card, a class; the audit.
- [x] The two download routes; `TOO_MANY_CARDS` (409).
- [x] The Cards panel: "Download PDF" on a card, "Download all cards (PDF)" on the class list, the server's sentence when it refuses.
- [x] `src/lib/app-url.ts`, `src/lib/results/verify-code.ts`, the pages `/verify` and `/verify/[code]`, `VerifyCredential`; the card shows full links.
- [x] Tests: unit (writer, layout, addresses and codes), API (every role, every refusal, the gate, remarks, drafts, characters, audit, the class file and its limits, the link), screens (both download buttons, the refusal, the public pages; Axe and overflow in both themes, desktop and phone).
- [x] Docs: tracker, HANDOVER, catalogues, CLAUDE.md banner.

## 5. Not in this task

- A Unicode font (Yoruba marks, Arabic and the like are drawn as base letters or counted `?`): see D6.
- A QR code for each link (a printed card is checked by typing the code, or by opening the link from the PDF). The certificates' QR (`CertificatePrint`) pointed at `/api/v1/verify-certificate/<token>`, a JSON address, for the same reason this task fixes the card: its page was the follow-up. **Done in task 0043:** the page answers for certificates and the QR is the page's link.
- Sending the PDF by e-mail, or a school-branded letterhead (the school's logo).
- A pupil or parent results screen.
- Signing the PDF or protecting it with a password.

## 6. Build record and tests (2026-11-10)

**What changed.** No migration. New: `src/lib/pdf/builder.ts`, `src/lib/results/report-card-pdf.ts`, `report-card-pdf-service.ts`, `verify-code.ts`, `src/lib/app-url.ts`, the routes `GET .../people/students/[id]/report-card/pdf` and `GET .../academics/results/report-cards/pdf`, the pages `src/app/verify/page.tsx` and `src/app/verify/[code]/page.tsx`, `VerifyCredential.tsx`. Changed: `http.ts` (`TOO_MANY_CARDS`), `CardsPanel.tsx` (the buttons, the address), `ReportCard.tsx` (full links, `origin` prop). Removed: `VerifyCertificateForm.tsx` (never mounted).

**Deployment.** Nothing to run: no migration. Set `APP_URL` on the deployment to the address people use (it already is: the sign-in cookie depends on it), otherwise the PDF prints the address the request came in on.

**Gates (order tsc, lint, build, tests).** tsc clean; eslint 0 errors (one older warning, `CertificatesConsole`); `pnpm build` OK with `/verify` and `/verify/[code]` in the route list; Prettier clean on every file changed; catalogues in sync.

**Tests (one lane, one worker, the production build).**
- Unit `pdf-builder` (new): what WinAnsi writes (Latin-1, the Windows-1252 punctuation, Yoruba reduced to base letters, a lone mark dropped, other scripts counted), measuring and wrapping (widths from the tables, words kept whole, a long word cut where it overflows), the file (well formed, readable back, deterministic, several pages), and links (clickable on their own page, only a plain `http(s)` address accepted, parentheses and backslashes escaped).
- Unit `report-card-pdf` (new): what is on a card, a card with no marks, a draft is "not official", sixty subjects over several pages with column heads repeated and none lost or doubled, a long remark continues, the links heading never left alone at a page end, several cards one to a page, no cards, the links are clickable, a long address goes under the subject, an address that cannot be a link is still printed.
- Unit `verify-links` (new): where the address comes from and what is refused as an address; a typed or pasted code read as a code, and what is not one.
- API `report-card-pdf` (new): every role that may download, the headers, the right facts; the link to the public page and never an API path; who may not (another pupil's card, a teacher of another arm or none, a stranger, signed out, another school); published and locked only for pupils and parents, drafts for staff with the warning; remarks by the card's rule; the gate holds the file as it holds the card; names outside Latin-1; audit rows; the class file (page order, headers, one audit row, staff only, the gate does not hold staff, empty class, 101 pupils refused).
- Screens `report-card-pdf-screens` (3 tests x desktop and phone, new): a card is saved as a PDF whose text is the card's and the card shows the full link; a class is saved as one file with a page per pupil; a refusal is shown in the server's words and nothing is saved. `verify-screens` (4 tests x desktop and phone, new): the link opens onto the answer (and shows no score or admission number; `noindex` and `no-referrer`); a code nobody has, a draft's code and a cut-short link each say so; the check page takes a typed code, a pasted link, refuses what is not a code; no API path on the page. Axe (WCAG 2.2 A/AA) and horizontal overflow in both themes.
- **Look at the file.** The PDF was also rendered to images (Ghostscript) and read as text (`pdftotext`, `pdfinfo`) while it was being built: the layout, the repeated column heads, the continued page, the links.
- **Mutation check.** In a copy, eight rules were broken (the link built as an API path; no cap on the class file; pupils and parents allowed the class file; drafts treated as official; a wrong cross-reference table; no audit row; the card showing the API path; the verify page indexable). After a rebuild **28 of the new tests failed**, each mutation by a test written for it (for example: no `meta[name="robots"]`; 0 audit rows where 2; 200 where 403 or 409); the copy was restored.
- **Regression:** the whole `unit` and `api` projects and the related screens (`results-screens`, `report-remarks-screens`, `report-card-gate-screens`, `auth-logo` and the new ones) on the final build: **2,771 passed, 0 failed, 1 skipped** (`auth-logo`'s mobile case, skipped by design).
- **What the work found.** (1) The card from task 0031 told people to check a mark at an API path (the maintainer saw it on the PDF): fixed (D8 to D11). (2) One of my own tests counted the subject name once and failed when the links section printed it again as a label; the test now counts the table and the links list separately.
- **Not run:** the rest of the browser suite, the HTTPS project, anything against a hosted database.

**Left for the maintainer.** ~~Certificates (`/api/v1/verify-certificate/<token>`, the QR on a printed certificate) have the same raw-address problem~~ (done in task 0043: `/verify/[code]` answers for certificates, and a browser that opens an old raw address is sent there). A Unicode font would draw every name exactly (D6).
