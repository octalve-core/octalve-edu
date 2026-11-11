# 0043: A certificate is checked on the same public page as a mark, not at a raw API address

- **Period / Focus:** 2026-11-11 (results and programs; the open point of task 0038: "Certificates (`/api/v1/verify-certificate/<token>`, the QR on a printed certificate) have the same raw-address problem")
- **Status:** Built and tested; PR into `dev` (see section 6)
- **Priority:** Medium
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-certificate-verify` / PR into `dev`
- **Started:** 2026-11-11

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Someone who scans the QR code on a printed certificate, or types the address printed under it, lands on a real page in the product that says whether the certificate is genuine, instead of on a block of JSON at `/api/v1/verify-certificate/<token>`. Certificates already printed keep working: opening their old address in a browser takes the person to the page.

## 2. Context

- Task 0038 made `/verify/<code>` (and `/verify`) the public page for a published mark, and printed full links on report cards. It left certificates as they were: `CertificatePrint` draws a QR code for, and prints, `https://<site>/api/v1/verify-certificate/<token>`, which answers with JSON.
- There are two kinds of certificate in Octalve, both checked with the same 32 lower-case hex character code, and the public API route `GET /api/v1/verify-certificate/[token]` already answers for both: the school's vocational certificates (`verifyPublicCertificate`: ISSUED only; the answer carries `verified`, the number, the title, the full name, the school, the issue date and the session) and the certificates of completion of a program (`verifyProgramCertificate`: the answer carries `withdrawn`, the school, the program, the title, the person as first name and last initial, the two dates and the serial number).
- A mark's code (`/api/v1/verify/[token]`) and a certificate's code are the same shape (32 hex). A code is never both: they come from random 128-bit values in different tables.
- AlEemaan does not have this problem: its certificate QR already points at `/verify/<token>`, a page that answers for a result or a certificate (its task 0043, P5).
- Both API routes limit attempts per address (60 in five minutes, a bucket each) and say `noindex`. The page keeps reading its answers from them (task 0038, D3), so it keeps those limits.

## 3. Decisions

- **D1. One page for every code.** `/verify/<code>` asks the mark route first; if that finds nothing it asks the certificate route; the first answer found is shown. A mark, a vocational certificate, a program certificate and "nothing found" are four answers of one page. A 429 or a network failure on either is "the check did not finish" and nothing is guessed. The API routes do not change what they answer to a script.
- **D2. What each answer says**, and no more than the API already makes public:
  - a mark: as today ("This mark is genuine": school, pupil, session, term, subject, grade, published on);
  - a vocational certificate: "This certificate is genuine": school, awarded to, certificate (title), number, issued on, session or term when it has one. If the school's record does not match the fingerprint (`verified` false): "This code exists but does not match the school's record. Do not rely on this document; contact the school", with no details;
  - a program certificate: "This certificate is genuine": school, program, certificate (title), awarded to (first name and last initial, as the API says), completed on, issued on, number. If it was withdrawn: "This certificate was withdrawn by the school and is no longer valid. Do not rely on it; contact the school", with the school and the number only;
  - nothing found: "No published mark or issued certificate was found for this code." with the same advice.
  The certificate's free-form `metadata` is never shown.
- **D3. The code box takes certificate codes too, and the old addresses.** `parseVerifyCode` reads a bare code, `/verify/<code>`, and also the raw `/api/v1/verify/<code>` and `/api/v1/verify-certificate/<code>` addresses (what someone copies from an old QR scan or card), and nothing with anything after the code. The page's words say "mark or certificate".
- **D4. The QR and the printed address of a certificate are the page's link**, from the same helper as the report cards (`verifyLink`): `https://<site>/verify/<token>`, never an API path. (The printed text stays the address a person can type.)
- **D5. Old printed QR codes work: a browser is sent to the page.** `GET /api/v1/verify/<token>` and `GET /api/v1/verify-certificate/<token>`, when the request asks for a web page (its `Accept` names `text/html`: what a browser sends on a navigation, and what a phone's camera app opens), answer `307` with `Location: /verify/<token>` for a well-formed token. Anything else (a script, `Accept: */*`, `application/json`, no header) gets the same JSON as before, a malformed token is still a 400, and the responses carry `Vary: Accept`. The redirect costs no attempt: the page makes its own lookups, which are limited. It reveals nothing a request for the page would not.
- **D6. Titles.** The tab says "Check a mark or certificate" on both `/verify` and `/verify/<code>` (it said "Report card mark check"); the form's button says "Check this code". Both pages stay out of search engines and do not pass their address on.
- **D7. Nothing else changes:** no migration, no new route, no new public data, no change to who may issue or withdraw a certificate.

## 4. Work breakdown

- [x] Design (this file).
- [x] `parseVerifyCode` (D3); `verified-view` (the four answers as headings and rows, pure); `VerifyCredential` asks both routes (D1, D2); the check page's words (D6).
- [x] `CertificatePrint` QR and printed address (D4); the two API routes redirect a browser and say `Vary: Accept` (D5).
- [x] Docs: the pages, components and functions catalogues, HANDOVER, tracker, CLAUDE.md banner, and the open point in 0038's record.
- [x] Tests: unit (the code reading, the answers), API (the redirect and its limits), screens (each answer, the print page's link, desktop and phone, Axe in both themes), the specs of task 0038 updated for the new words, mutation check, regression.

## 5. Not in this task

- A QR code on the PDF report card (task 0038 left it out on purpose).
- Changing who may see a certificate or what the API answers to a script.
- AlEemaan (its page already answers for certificates).

## 6. Build record and tests

**What exists.** `src/lib/results/verified-view.ts` (new, pure: `describe` turns what the two public routes answer into a heading, a sentence and rows; `longDate`); `VerifyCredential` asks the mark route and, on a 404, the certificate route, and draws the first answer found (a 429 or a network failure on either is "the check did not finish", never "nothing found"); `parseVerifyCode` also reads the raw `/api/v1/verify/<code>` and `/api/v1/verify-certificate/<code>` addresses; `CertificatePrint` uses `verifyLink`; `src/lib/api/wants-page.ts` (new) and the two API routes (`307` with a relative `Location` for a request whose `Accept` asks for a page and a well-formed token, no attempt counted, `Vary: Accept` on every response). No migration, no new route, no new public data.

**Gates (order tsc, lint, build, tests).** tsc clean; eslint clean on every file added or changed; `pnpm build` OK on the lane; Prettier clean on every changed file; catalogues checked with `verify_catalogs.py` (827 files, 827 rows, none missing, extra, duplicate or broken).

**New tests.** Unit `verify-links` (updated: the raw addresses are read, a code with anything after it is not), `verified-view` (new: the four answers' headings and rows, with `toEqual`, and that metadata, score and admission number are in no answer), `wants-page` (new). API `verify-redirect` (new, both routes: a browser is sent by a relative address for a code the route knows or not; a script gets JSON and `Vary: Accept`; a malformed code is 400 for a browser too; a redirect costs no attempt and the limit of 60 still stops a script; the redirect says the same for a known and an unknown code; the certificate route's JSON is unchanged). Browser `verify-certificate-screens` (new, desktop and phone, Axe and overflow in both themes: the vocational answer, the completion answer, a withdrawn one, one that does not match, a draft, an unknown code, the check page taking a certificate's code and every old address, an old raw address landing on the page, the check not guessing when the certificate lookup is limited, the print page's printed address and its QR drawn for the page's link). `verify-screens` (task 0038) updated for the new words.

**First run (unmutated build, lane 3): 65 passed, 0 failed** (unit 18, api 20, setup 1, desktop 13, phone 13 over the six spec files then run).

**Mutation check (three rounds, each on its own build, applied in the lane copy and restored with `lanes.mjs sync` and checked identical with `cmp`; the failing tests were read one by one).** Each mutation below is caught by the tests named, and no test is the only witness of two mutations at once:
- Round 1 (17 of 55 failed; 38 passed).
  - **M1**, the parser no longer reads `-certificate` addresses: unit `verify-links` "the raw API addresses ... are read too" (`parseVerifyCode` gave `null` for `/api/v1/verify-certificate/<code>`); screens "the check page takes a certificate's code ..." (the typed raw address stayed on `/verify`).
  - **M3**, a 429 on the certificate lookup is read as "nothing found": screens "the check does not guess ..." only ("The check did not finish" not found).
  - **M4**, the print page prints the API address: screens "the printed certificate draws a QR code ..." only (the printed "Check it at ..." line not found).
  - **M8**, the withdrawn answer also shows the person: unit `verified-view` "that was withdrawn ... only the school and the number" (an extra "Awarded to" row); screens "a withdrawn certificate says so ...".
  - **M9**, a certificate that does not match is answered as genuine: unit `verified-view` "whose fingerprint does not match ..." (tone "good"); screens "a certificate that does not match ..." (heading not found).
  - **M10**, an extra row shows the metadata: unit `verified-view` "a school's vocational certificate is genuine, with the school, who it was awarded to ..." (an extra row) and "what is never shown: a certificate's free-form metadata and a mark's score are not in any answer"; screens "a school's vocational certificate is answered ..." (an extra "Details" row).
- Round 2 (7 failed; 48 passed).
  - **M5**, the mark route never redirects: API "the mark route: a browser ... is sent to the page" (200, not 307) and "a redirect costs no attempt ..." (visit 1 was 404, not a redirect). The screens test of old addresses stopped at its first step (M7, below), so its mark-route step did not run in this round.
  - **M7**, the certificate route redirects to an absolute address (`http://localhost:3000/...`): API "the certificate route: a browser ... is sent to the page, by a relative address" (the `Location` was absolute); screens "an old printed QR code ... lands on the page" (`ERR_CONNECTION_REFUSED`: the browser followed it).
  - **M13**, the QR encodes the API address while the printed text stays the page's link: screens "the printed certificate draws a QR code ..." only (the QR's squares differ from the page link's).
- Round 3 (4 failed; 51 passed).
  - **M6**, a redirect on the mark route counts an attempt: API "the mark route: a redirect costs no attempt ..." only (the first lookup after 70 browser visits was 429, not 404).
  - **M11**, the mark route drops `Vary: Accept`: API "the mark route: a browser ... is sent to the page" and "a script ... get the JSON" (the header lacked `accept`).
  - **M12**, the certificate route redirects a malformed code: API "the certificate route: a code that is not well formed is refused ..." only (307, not 400).
- `wantsPage` (a fourth, unit-only round with no rebuild, run after its own spec was added: 3 passed on the real code, then 3 failed under three mutations, one test each): **M14** a `q=0` is read as wanted (`>= 0`): "text/html that the client refuses with q=0 is not a request for a page"; **M15** the header is not lower-cased: "what a browser sends ..." (`TEXT/HTML` was refused); **M16** `startsWith` instead of equality: "a script, curl, a fetch for JSON ..." (`text/htmlx` was accepted).
- **Not mutated one by one:** the same lines of the two routes on the other route (the API tests run for both routes, so they would catch it, but it was not shown).

**Regression (clean build of the unmutated tree, lane 3): 309 passed, 0 failed, 1 skipped (12.8 minutes).** The 25 spec files: unit `verify-links`, `verified-view`, `csp`, `landing-copy`, `program-completion`, `report-card-pdf`, `route-area-guard`, `route-role-guard`; API `verify-redirect`, `certificates-verify`, `certificates-access`, `csp`, `landing-router`, `malformed-path`, `program-completion`, `report-card-pdf`, `security-headers`, `results`; browser (desktop and phone) `verify-screens`, `verify-certificate-screens`, `landing-screens`, `auth-logo`, `csp`, `report-card-pdf-screens`, `responsive-and-a11y`. The one skip is `auth-logo` "the panel's headline ... are still hidden from assistive technology" on the phone project (`test.skip(isMobile, "the panel only exists from 1024 px up")`: by design, not touched by this task). The `wants-page` spec ran on its own (3 passed) after the run.

**Not run.** The whole unit and API projects (only the specs that touch verification, certificates, programs' completion, report-card PDFs, security headers, the landing page and the browser-wide responsive spec ran); the HTTPS project; a scan of a real printed QR code with a phone (the QR was compared square by square with the library's own drawing of the page's link instead); a hosted walkthrough.

**Decisions made while building (beyond D1 to D7).** The redirect is `307` (not `301`/`308`): a permanent redirect would be cached by browsers for an address that a script may still want JSON from. The answer of a certificate whose fingerprint does not match shows no details at all (the API answers `verified: false` with details; the page does not repeat them). The API's `metadata` is not shown on the page (the API keeps carrying it).

**Left for the maintainer.** The wording of the landing page's link ("Check a report card", it now also checks certificates) is part of the landing-page review (HANDOVER 6.20).
