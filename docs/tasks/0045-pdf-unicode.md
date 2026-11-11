# 0045: Report-card PDFs draw every name and remark as written: Yoruba marks, Arabic and the rest of Unicode that the fonts hold

- **Period / Focus:** 2026-11-11 (the item left open by task 0038, decision D6: "a Unicode font would draw every name exactly")
- **Status:** Built and tested; in review (PR into `dev`)
- **Priority:** Medium
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-pdf-unicode` / PR into `dev`
- **Started:** 2026-11-11

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

A report-card PDF shows a pupil's name, a subject's name and the teacher's and principal's remarks exactly as they are written: `Ọlá Adébáyọ̀`, `Ṣéyí`, `أحمد`, with their marks, in the right order and joined the way the script requires. Until now the PDF writer used the three standard fonts in WinAnsi, which draw a Yoruba mark as its base letter (`ọ` as `o`) and anything else as `?`, and counted what it lost in the `X-Report-Card-Unsupported-Characters` header.

## 2. Context

- `src/lib/pdf/builder.ts` (task 0038) writes PDF 1.4 by hand: pages of text, rectangles and links, with Helvetica, Helvetica-Bold and Courier, measured from tables of advance widths. A text is written as a hex string of WinAnsi bytes; a letter WinAnsi lacks is written as its base letter when it has one, else as `?`. `unsupported` counts the losses; the PDF routes send the count in a header.
- `report-card-pdf.ts` asks the builder to `width`, `wrap` and draw each string; it never sees an encoding.
- The machine has the Noto fonts (SIL Open Font License 1.1: free to bundle and embed, the licence text travels with them): Noto Sans (Latin, Greek, Cyrillic, with every Yoruba letter and the combining marks) and Noto Naskh Arabic. A trial with `fontkit` showed: Yoruba text with combining tone marks lays out with no missing glyph; Arabic text is shaped (initial, medial and final forms, the lam-alef and Allah ligatures); a subset of a few glyphs is a few kilobytes. `bidi-js` gives the embedding levels for mixed-direction text.
- `pdftotext`, `pdffonts` and Ghostscript are installed here, so what the writer produces can be read and drawn by software that is not ours.
- The test helper `tests/support/pdf.ts` reads page content by regular expression and decodes hex strings as WinAnsi.

## 3. Decisions

- **D1. Embed fonts only for text that needs them.** A string that WinAnsi can write exactly (printable ASCII, Latin-1, the Windows-1252 punctuation, after Unicode normalisation to NFC) is drawn as before, with the standard fonts, so a card whose words are all of that kind is the file it was (no font is embedded, no object changes). A string with any other character is drawn with embedded Noto fonts. *Cost:* a name with `ọ` is drawn in Noto Sans while the words around it are Helvetica. *Chosen over:* embedding Noto for everything, which makes one look but changes every measure and every existing file. The maintainer can choose "always Noto" later; it is a one-line switch in the writer.
- **D2. Fonts and where they come from.** Noto Sans Regular and Bold (Latin and everything that is not Arabic); Noto Naskh Arabic Regular and Bold (Arabic script). The four `.ttf` files and the licence notice live in `src/lib/pdf/fonts/` (about 1.4 MB). Courier text that needs Unicode (a code never does) falls back to Noto Sans Regular.
- **D3. Shaping and order.** `fontkit` lays out a run (glyphs, advances, mark positions: GSUB/GPOS), `bidi-js` gives the direction of each character; a string is split into runs of one font and one level, the runs are put in visual order (the standard rule L2, run by run: a run is never reversed inside, because `fontkit` returns an Arabic run already in visual order), and an odd-level mirrored character (a bracket) is replaced by its mirror. The base direction is the first strong character's.
- **D4. What is written.** Each Unicode text is one text object with a font switch for each run and the glyphs placed one by one (`Tm` per glyph: exact for marks, which sit above or below their base). The fonts are Type0 / CIDFontType2 with `Identity-H`, subset per document to the glyphs used (a few kilobytes), the font file Flate-compressed, a `W` array of widths, a `ToUnicode` CMap so the text can be copied and searched. **No `ActualText`** (the first design had one for right-to-left text; it was removed): poppler's `pdftotext` undoes the glyph order itself and, given an `ActualText`, reversed the line a second time. Without it `pdftotext -raw` gives for our file exactly what it gives for the same text printed by Chromium (the same letters, in the same order, with the same right-to-left mark), and the `ToUnicode` map is what copy and search use.
- **D5. Measuring.** A Unicode string is measured from the advances `fontkit` returns (units per em 1000 in these fonts, so the unit is the same thousandth of an em as the Helvetica tables); `wrap` and the card's `fit` (which cut a name with an ellipsis) therefore keep working, and `fit` cuts between grapheme clusters, never between a letter and its mark.
- **D6. What is still unsupported.** A character that neither Noto font has (Chinese, Devanagari, emoji) is drawn as `?` in Noto Sans and counted in `unsupported`, exactly as before; the header's meaning is unchanged ("characters the fonts could not show"), its number shrinks.
- **D7. No `dir` guess for alignment.** A right-to-left string is drawn from the x it is given (a name at the left of its field starts at the left); right-aligning a whole Arabic paragraph is a layout decision for the card, not for the writer, and is left (see section 5).
- **D8. Serverless bundling.** The fonts are read from disk once per process (`process.cwd()/src/lib/pdf/fonts`); `next.config.ts` lists them in `outputFileTracingIncludes` for the two PDF routes so they are in the deployed function; the build output (`.next/server/.../*.nft.json`) is checked for them.
- **D9. Two new dependencies**, `fontkit` (2.0.4) and `bidi-js` (1.0.3), with `@types/fontkit` for development. No other change to the dependency tree.
- **D10. The builder stays free of I/O.** Fonts are loaded by `src/lib/pdf/unicode-fonts.ts` and given to the builder; the pure parts (the exactness test, the run splitting, the bidi order, the CMap text) have unit tests of their own.

## 4. Work breakdown

- [x] Design (this file).
- [x] Fonts and licence in `src/lib/pdf/fonts/`; `unicode-fonts.ts` (loader); types for `bidi-js`; the two dependencies.
- [x] `unicode-text.ts` (exactness, runs, bidi order, mirroring); the builder's `width`, `wrap`, `text`, `build` (embedded fonts, ToUnicode); `fit` by grapheme.
- [x] `next.config.ts` tracing for the two routes; the build output checked.
- [x] Test helper `tests/support/pdf.ts` reads Unicode text (through the ToUnicode maps) and page content by the page's own `/Contents`; the tests that pinned the old behaviour say what is true now.
- [x] Tests: unit (the pure parts and the builder), API (a Yoruba pupil and an Arabic pupil on a real card), screens (unchanged), `pdftotext` / `pdffonts` / Ghostscript read the output, mutation check, regression.
- [x] Docs: catalogues, HANDOVER, tracker, CLAUDE.md banner, task 0038's open point.

## 5. Not in this task

- Scripts that neither Noto font holds (Chinese, Devanagari, emoji, Ethiopic...).
- Right-aligning right-to-left paragraphs, or a mirrored card layout for an Arabic-language school (the card is laid out left to right).
- The question-bank exam paper writer (`question-bank/printing.ts`), which has its own WinAnsi encoder and turns letters outside ASCII into `?`.
- Embedding Noto for all text (D1).

## 6. Build record and tests

**Built on** `claude/octalve-pdf-unicode`. No migration. New: `src/lib/pdf/unicode-text.ts` (90 lines, pure), `src/lib/pdf/unicode-fonts.ts` (117 lines, the only file that reads the fonts), `src/lib/pdf/fonts/` (four Noto `.ttf` files, 1.4 MB, and `OFL.txt`), `src/types/bidi-js.d.ts`. Changed: `builder.ts` (+230 lines: `needsUnicode`, Unicode `width`/`wrap`/`text`, the font objects, `ToUnicode`, UTF-16 title and author), `report-card-pdf.ts` (`fit` by grapheme cluster), `next.config.ts` (`serverExternalPackages`, `outputFileTracingIncludes` for the two PDF routes), `package.json` and the lockfile (`fontkit` 2.0.4, `bidi-js` 1.0.3, `@types/fontkit`), `tests/support/pdf.ts` (reads a page's own `/Contents`, hex strings in WinAnsi or UTF-16, `ToUnicode` maps, the embedded font names, a structural check).

**What it was checked against, apart from our own tests.** `pdftotext` and `pdffonts` (poppler) read the file; Ghostscript (`gs`) draws every page without a complaint, and a probe page (Yoruba with every mark, bold, Arabic joined and right to left, a bracket mirrored, a mixed line, a right-aligned name, a paragraph wrapped, `??` for Chinese and `?` for an emoji) was rendered to an image and looked at: every mark sits on its letter and the Arabic reads right to left, joined; Chromium printed the same Arabic text to a PDF and `pdftotext -raw` gave for it what it gives for ours. These three tests skip on a machine without poppler or Ghostscript (they are installed here).

**Tests.** Unit `pdf-unicode` (new: 31 tests in four groups: which text needs the fonts, the runs of a line and their order (including a comparison with the reference implementation of the algorithm), what the writer produces, software that is not ours reads and draws the file); `report-card-pdf` unit and API specs extended (a Nigerian name, an Arabic name, a card of plain words embeds no font, characters no font has are counted, a long name with marks is cut between letters); `pdf-builder` unchanged and green. The two statements the old tests pinned (Yoruba reduced to base letters, other scripts `?`) now describe only the WinAnsi path.

**Bugs found while building, each now held by a test.**
- Noto Naskh Arabic has no ASCII brackets: a `(` in Arabic text was drawn as an empty box. Characters the run's own font lacks fall back, one by one, to Noto Sans in the line's weight.
- A run at an odd level that holds several pieces (a Latin word inside Arabic) must reverse the order of the pieces, not the pieces themselves.
- `fontkit` keeps one glyph object per glyph number for the life of a font; cutting a subset creates the component glyphs of the composite glyphs (the `e` of `é`) without their characters, so whether `e` knew it stood for "e" depended on which document the process wrote first. Layout and subsets now use two instances of each font (`UnicodeFontSet`).
- `ActualText` made poppler reverse a right-to-left line twice: removed (D4).
- **Found by the whole-suite run, not by me:** my new source held literal invisible characters (U+0600, U+200B to U+200F, U+202A to U+202E, U+2066 to U+2069, U+FEFF) as the ends of character-class ranges and in test strings, which the repository's own `source-hygiene` test forbids. Six lines in two files; all are `\uXXXX` escapes now (the script ranges too, for readability).

**Mutation check.** Sixteen changes to the code, each applied alone to a copy of the code in a test lane and run against the three PDF unit specs (68 tests on the original code, 69 after the test added below). Eight of them had first been run together in one round; because a test that fails in a combined round may belong to any of them, **every mutation was run again on its own** and the table is from those runs.

| | Change | Result alone |
| --- | --- | --- |
| P1 | `needsUnicode` always false | 17 tests fail (the embedding, extraction and report-card tests) |
| P2 | Latin-1 letters (`é`) counted as needing the fonts | 5 fail: the "none of ASCII, Latin-1..." and the NFC tests, "words all WinAnsi embed no font", the report card's "card of plain words embeds no font", and the `pdf-builder` title test |
| P3 | the runs left in logical order | 4 fail: Arabic inside Latin, mirrored bracket, the reference-implementation comparison, a bracket in Arabic |
| P4 | no mirroring of an odd-level bracket | 3 fail: mirrored bracket, the reference comparison, a bracket in Arabic |
| P5 | rule L2 stops one level early (`>` for `>=`) | 5 fail: order of the pieces, mirrored bracket, the reference comparison, `reorder`, a bracket in Arabic |
| P6 | the pieces of an odd-level run not reversed | 1 fails: a bracket in Arabic |
| P7 | no `ToUnicode` entry for any glyph | 14 fail |
| P8 | the bold font ignored for a run's own script | 2 fail: "bold text uses the bold font", "measured from the font" |
| P8b | the bold weight ignored for the fallback to Noto Sans | **survived** when run alone (68 passed): the first round hid it behind P8's failure. Test added: "a bracket in bold Arabic text falls back to Noto Sans Bold, not Regular". Alone now: that one test fails, and nothing else |
| P9 | Unicode text measured with the Helvetica tables | 2 fail: "measured from the font", "right and centre alignment use the measured width" |
| P10 | no fallback to Noto Sans for a character Naskh lacks | 1 fails: a bracket in Arabic |
| P11a, P11b | `wrap` and the card's `fit` cut by code point, not by cluster | both survive (68 passed each): see below |
| P12 | layout and cutting share one font instance | 4 fail: mixed Latin, Yoruba and Arabic; "a glyph does not depend on which document came first"; several pages and links; the card's "characters no font has are counted" |
| P13 | invisible direction marks drawn, not dropped | 1 fails: "the invisible direction marks steer the order and are never drawn" |
| P14 | the document title and author always in WinAnsi | 1 fails: "the document information is written exactly" |

Survivors: **P11a and P11b are equivalent mutants, not caught by any test and not provable by one.** A combining mark adds no advance in either font, so "the longest prefix that fits" never ends between a letter and its mark: the prefix that ends at the mark is tried first and has the same width as the one that ends at the letter. The cut can differ only when a single cluster is wider than a whole line. The cluster rule stays because it states what is meant and does not depend on the fonts, and the tests (`wrap keeps working with Unicode words`, the card's long name) hold the behaviour.

**Regression.** A clean build in the test lane, then the whole `unit` and `api` projects and three browser specs.
- First run: **2,879 passed, 1 failed** in 17.5 minutes: `source-hygiene` (the literal characters above), a real defect of this task; and the three browser specs (`report-card-pdf-screens`, `verify-screens`, `landing-screens`), 37 passed.
- After the fix and the test added for P8b: **2,881 passed, 0 failed, 0 skipped** in 24.2 minutes (the `unit` and `api` projects; the poppler and Ghostscript tests ran, they were not skipped), and the three browser specs **37 passed** in 2.6 minutes, on a clean build (`pnpm build` exit 0). The 2,881 are the first run's 2,879 passed plus the fixed `source-hygiene` test and the test added for P8b.

**Deployment.** The build output was read: the `.nft.json` of both report-card PDF routes lists the four fonts, `OFL.txt`, `fontkit` and `bidi-js` (each file list is about 1,700 files long, as the route already pulled in the database client). Not tried: an actual deploy to the hosting provider (no deploy was made, by the standing rule).

**Not tested, and not claimed.** No person who reads Arabic or Yoruba has looked at a printed page; shaping, joining and the order were checked with Ghostscript, poppler and Chromium on the same text, and by the algorithm's reference implementation. Adobe Acrobat and Apple Preview were not available. Right-to-left alignment of a whole Arabic remark, and a mirrored card, are not built (section 5). The size of the work on a large class (100 cards with Unicode names): the fonts are read once per process and the subsets are small, but no timing was taken.
