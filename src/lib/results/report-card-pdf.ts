import { verifyLink, verifyPageUrl } from "@/lib/app-url";
import { PdfBuilder, type Rgb } from "@/lib/pdf/builder";

// A pupil's report card as a PDF (task 0038): the same facts as the card on the screen, laid out on A4, one card to a page (more when the subjects need it), several cards in one file for a class.
// Pure: it draws the data it is given. What a viewer is allowed to see (the payment gate, which results a pupil sees, when remarks are shown) is decided before the data gets here.

export type PdfCard = {
  student: { firstName: string; lastName: string; admissionNo: string; classGroup?: string; classArm?: string };
  period: { label: string; sessionLabel: string };
  summary: {
    totalScore: number;
    totalMax: number;
    percentage: number;
    classRank: number | null;
    classSize: number;
    promotionOutcome: string;
  };
  subjects: {
    subjectName: string;
    subjectCode: string | null;
    score: number;
    maxScore: number;
    gradeLetter: string | null;
    gradeRemark: string | null;
    status: string;
    verificationToken: string | null;
  }[];
  remarks: { teacher: string | null; principal: string | null };
};

const LEFT = 40;
const RIGHT = 595.28 - 40;
const WIDTH = RIGHT - LEFT;
const TOP = 802;
const BOTTOM = 66;
const INK: Rgb = [0.1, 0.1, 0.12];
const MUTED: Rgb = [0.38, 0.4, 0.45];
const RULE: Rgb = [0.78, 0.8, 0.84];
const PANEL: Rgb = [0.95, 0.96, 0.97];
const WARN: Rgb = [0.62, 0.18, 0.1];
const LINK: Rgb = [0.08, 0.25, 0.66];
const OFFICIAL = new Set(["PUBLISHED", "LOCKED"]);

/// Cut a text to a width with an ellipsis, so a long name cannot run over its neighbour.
function fit(pdf: PdfBuilder, text: string, font: "regular" | "bold", size: number, width: number): string {
  if (pdf.width(text, font, size) <= width) return text;
  let cut = text.length;
  while (cut > 1 && pdf.width(`${text.slice(0, cut)}…`, font, size) > width) cut--;
  return `${text.slice(0, cut)}…`;
}

const markText = (score: number, max: number) => `${score} / ${max}`;

export type RenderedPdf = { pdf: Buffer; pages: number; unsupported: number };

export function renderReportCardsPdf(
  cards: readonly PdfCard[],
  options: { institution: string; generatedAt: Date; origin: string },
): RenderedPdf {
  const pdf = new PdfBuilder({
    title:
      cards.length === 1 ? `Report card of ${cards[0].student.firstName} ${cards[0].student.lastName}` : `Report cards (${cards.length})`,
    author: options.institution,
    producer: "Octalve Edu",
  });
  if (cards.length === 0) pdf.addPage();

  for (const card of cards) {
    let y = pdf.addPage() >= 0 ? TOP : TOP;
    const who = `${card.student.firstName} ${card.student.lastName}`;
    const newPage = () => {
      pdf.addPage();
      y = TOP;
      pdf.text(LEFT, y, fit(pdf, `Report card of ${who} (continued)`, "bold", 9, WIDTH), { font: "bold", size: 9, color: MUTED });
      y -= 22;
    };
    const need = (height: number) => {
      if (y - height < BOTTOM) newPage();
    };

    // Header
    for (const line of pdf.wrap(options.institution.toUpperCase(), "bold", 16, WIDTH)) {
      pdf.text((LEFT + RIGHT) / 2, y, line, { font: "bold", size: 16, align: "center", color: INK });
      y -= 20;
    }
    pdf.text((LEFT + RIGHT) / 2, y, "TERM REPORT", { size: 9, align: "center", color: MUTED });
    y -= 15;
    pdf.text((LEFT + RIGHT) / 2, y, `${card.period.sessionLabel} · ${card.period.label}`, {
      font: "bold",
      size: 11,
      align: "center",
      color: INK,
    });
    y -= 12;
    pdf.line(LEFT, y, RIGHT, y, { color: RULE });
    y -= 16;

    const unofficial = card.subjects.some((s) => !OFFICIAL.has(s.status));
    if (unofficial) {
      pdf.text(LEFT, y, "Not official: some of these marks are not yet published.", { font: "bold", size: 9, color: WARN });
      y -= 16;
    }

    // Who
    const half = WIDTH / 2;
    pdf.rect(LEFT, y - 76, WIDTH, 76, { fill: PANEL });
    const cell = (label: string, value: string, x: number, top: number) => {
      pdf.text(x + 10, top - 12, label.toUpperCase(), { size: 7, color: MUTED });
      pdf.text(x + 10, top - 25, fit(pdf, value, "bold", 10, half - 20), { font: "bold", size: 10, color: INK });
    };
    const cls = card.student.classGroup ? `${card.student.classGroup} ${card.student.classArm ?? ""}`.trim() : "-";
    const position = card.summary.classRank ? `${card.summary.classRank} of ${card.summary.classSize}` : "-";
    cell("Pupil", who, LEFT, y);
    cell("Admission no.", card.student.admissionNo, LEFT + half, y);
    cell("Class", cls, LEFT, y - 38);
    cell("Position", position, LEFT + half, y - 38);
    y -= 76 + 12;

    // Totals
    const boxW = (WIDTH - 20) / 3;
    const boxes: [string, string][] = [
      ["Total", markText(card.summary.totalScore, card.summary.totalMax)],
      ["Average", `${card.summary.percentage}%`],
      ["This term's marks", card.summary.promotionOutcome === "PROMOTED" ? "On track" : "Below the mark"],
    ];
    boxes.forEach(([label, value], i) => {
      const x = LEFT + i * (boxW + 10);
      pdf.rect(x, y - 44, boxW, 44, { stroke: RULE });
      pdf.text(x + boxW / 2, y - 14, label.toUpperCase(), { size: 7, align: "center", color: MUTED });
      pdf.text(x + boxW / 2, y - 33, value, { font: "bold", size: 15, align: "center", color: INK });
    });
    y -= 44 + 16;

    // Subjects
    const cols = { subject: LEFT + 8, mark: LEFT + 218, grade: LEFT + 298, remark: LEFT + 345 };
    const widths = { subject: 202, remark: RIGHT - 8 - cols.remark };
    const header = () => {
      pdf.rect(LEFT, y - 18, WIDTH, 18, { fill: PANEL });
      for (const [label, x] of [
        ["SUBJECT", cols.subject],
        ["MARK", cols.mark],
        ["GRADE", cols.grade],
        ["REMARK", cols.remark],
      ] as const)
        pdf.text(x, y - 12, label, { font: "bold", size: 7.5, color: MUTED });
      y -= 18;
    };
    need(18 + 24);
    header();
    if (card.subjects.length === 0) {
      pdf.text((LEFT + RIGHT) / 2, y - 18, "No marks have been published for this term yet.", { size: 9.5, align: "center", color: MUTED });
      y -= 34;
    }
    for (const s of card.subjects) {
      const name = s.subjectCode ? `${s.subjectName} (${s.subjectCode})` : s.subjectName;
      const subjectLines = pdf.wrap(name, "bold", 9.5, widths.subject);
      const remarkLines = pdf.wrap(s.gradeRemark ?? "", "regular", 9, widths.remark);
      const height = Math.max(subjectLines.length * 12, remarkLines.length * 11.5) + 10;
      if (y - height < BOTTOM) {
        newPage();
        header();
      }
      subjectLines.forEach((line, i) => pdf.text(cols.subject, y - 14 - i * 12, line, { font: "bold", size: 9.5, color: INK }));
      pdf.text(cols.mark, y - 14, markText(s.score, s.maxScore), { size: 9.5, color: INK });
      pdf.text(cols.grade, y - 14, s.gradeLetter ?? "-", { font: "bold", size: 9.5, color: INK });
      remarkLines.forEach((line, i) => pdf.text(cols.remark, y - 14 - i * 11.5, line, { size: 9, color: MUTED }));
      y -= height;
      pdf.line(LEFT, y, RIGHT, y, { color: RULE, width: 0.4 });
    }
    y -= 16;

    // Remarks
    for (const [label, text] of [
      ["TEACHER'S REMARK", card.remarks.teacher],
      ["PRINCIPAL'S REMARK", card.remarks.principal],
    ] as const) {
      if (!text) continue;
      const lines = pdf.wrap(text, "regular", 9.5, WIDTH - 20);
      let from = 0;
      let first = true;
      while (from < lines.length) {
        // A long remark continues on the next page rather than running off this one.
        const room = Math.floor((y - BOTTOM - 34) / 12.5);
        if (room < 2) {
          newPage();
          continue;
        }
        const part = lines.slice(from, from + room);
        const height = part.length * 12.5 + (first ? 30 : 16);
        pdf.rect(LEFT, y - height, WIDTH, height, { stroke: RULE });
        if (first) pdf.text(LEFT + 10, y - 14, label, { font: "bold", size: 7.5, color: MUTED });
        part.forEach((line, i) => pdf.text(LEFT + 10, y - (first ? 28 : 14) - i * 12.5, line, { size: 9.5, color: INK }));
        y -= height + 10;
        from += part.length;
        first = false;
      }
    }

    // Verification links: a full, clickable address for each published mark (the code is its last part), and the page to type a code into.
    const tokens = card.subjects.filter((s) => s.verificationToken && OFFICIAL.has(s.status));
    if (tokens.length > 0) {
      const note = pdf.wrap(
        `Anyone can check that a published mark is genuine: open its link, or go to ${verifyPageUrl(options.origin)} and type the code at the end of the link.`,
        "regular",
        8,
        WIDTH,
      );
      need(14 + note.length * 10 + 6 + 13); // the heading, the note and the first link stay together
      pdf.text(LEFT, y - 8, "VERIFICATION LINKS", { font: "bold", size: 7.5, color: MUTED });
      note.forEach((line, i) => pdf.text(LEFT, y - 20 - i * 10, line, { size: 8, color: MUTED }));
      y -= 14 + note.length * 10 + 6;
      const drawLink = (x: number, baseline: number, text: string, url: string) => {
        const w = pdf.width(text, "mono", 7.5);
        pdf.text(x, baseline, text, { font: "mono", size: 7.5, color: LINK });
        pdf.line(x, baseline - 1.5, x + w, baseline - 1.5, { color: LINK, width: 0.4 });
        pdf.link(x, baseline - 2.5, w, 10.5, url);
      };
      for (const s of tokens) {
        const url = verifyLink(options.origin, s.verificationToken!);
        const label = fit(pdf, s.subjectName, "bold", 8, 134);
        if (pdf.width(url, "mono", 7.5) <= RIGHT - (LEFT + 140)) {
          need(13);
          pdf.text(LEFT, y - 8, label, { font: "bold", size: 8, color: INK });
          drawLink(LEFT + 140, y - 8, url, url);
          y -= 13;
        } else {
          // A long address does not fit beside the subject: it goes underneath (and is cut at the line's end if it must).
          const pieces = pdf.wrap(url, "mono", 7.5, WIDTH - 14);
          need(12 + pieces.length * 10);
          pdf.text(LEFT, y - 8, label, { font: "bold", size: 8, color: INK });
          pieces.forEach((piece, i) => drawLink(LEFT + 14, y - 20 - i * 10, piece, url));
          y -= 12 + pieces.length * 10 + 3;
        }
      }
    }
  }

  // Footers: the page number needs the number of pages, so it is drawn last.
  const total = pdf.pageCount;
  const made = options.generatedAt.toISOString().slice(0, 10);
  for (let i = 0; i < total; i++) {
    pdf.selectPage(i);
    pdf.line(LEFT, 52, RIGHT, 52, { color: RULE, width: 0.4 });
    pdf.text(LEFT, 40, fit(pdf, `${options.institution} · generated ${made}`, "regular", 7.5, WIDTH - 90), { size: 7.5, color: MUTED });
    pdf.text(RIGHT, 40, `Page ${i + 1} of ${total}`, { size: 7.5, align: "right", color: MUTED });
  }
  return { pdf: pdf.build(options.generatedAt), pages: total, unsupported: pdf.unsupported };
}
