import { Role, BankVisibility } from "@prisma/client";

export interface PrintableQuestion {
  prompt: string;
  questionType?: string;
  points?: number;
  options?: string[];
  studentAnswer?: string | null;
  correctAnswer?: string | null;
  explanation?: string | null;
  awardedScore?: number | null;
  feedback?: string | null;
  isCorrect?: boolean | null;
}

export interface PrintableDocument {
  title: string;
  branchName: string;
  watermark: string;
  date: string;
  instructions?: string | null;
  totalPoints?: number;
  classGroupName?: string | null;
  kindLabel?: string;
  questions: PrintableQuestion[];
}

export interface ExamWindowFacts {
  examWindowStart?: Date | string | null;
  examWindowEnd?: Date | string | null;
  nearExamDays?: number;
}

/**
 * Determines whether the current time falls within the near-exam window or the active exam window.
 */
export function isNearExamWindow(facts: ExamWindowFacts, now = new Date()): boolean {
  if (!facts.examWindowStart) {
    return false;
  }

  const startDate = new Date(facts.examWindowStart);
  if (isNaN(startDate.getTime())) {
    return false;
  }

  const nearDays = facts.nearExamDays !== undefined && facts.nearExamDays >= 0 ? facts.nearExamDays : 7;
  const nearWindowStart = new Date(startDate.getTime() - nearDays * 24 * 60 * 60 * 1000);

  let windowEnd: Date;
  if (facts.examWindowEnd) {
    const parsedEnd = new Date(facts.examWindowEnd);
    windowEnd = isNaN(parsedEnd.getTime()) ? new Date(startDate.getTime() + 4 * 60 * 60 * 1000) : parsedEnd;
  } else {
    // Default exam duration window is 4 hours if no explicit end time is recorded
    windowEnd = new Date(startDate.getTime() + 4 * 60 * 60 * 1000);
  }

  const currentTime = now.getTime();
  return currentTime >= nearWindowStart.getTime() && currentTime <= windowEnd.getTime();
}

export interface PrintTargetFacts {
  isExam?: boolean;
  isExamTemplate?: boolean;
  examWindowStart?: Date | string | null;
  examWindowEnd?: Date | string | null;
  visibility?: BankVisibility;
  authorUserId?: string | null;
}

export interface PrintViewer {
  userId: string;
  role: Role;
  isSuperAdmin?: boolean;
  isExamApprover: boolean;
}

/**
 * Evaluates whether a staff member has permission to print a target document or question paper.
 */
export function canPrintTarget(
  target: PrintTargetFacts,
  viewer: PrintViewer,
  nearExamDays = 7,
  now = new Date(),
): { allowed: boolean; reason?: string } {
  if (viewer.isSuperAdmin || viewer.role === Role.ADMIN) {
    return { allowed: true };
  }

  const isExamTarget = Boolean(
    target.isExam || target.isExamTemplate || target.examWindowStart || target.visibility === BankVisibility.TEACHERS_ONLY_UNTIL,
  );

  if (!isExamTarget) {
    // Standard forms, practice sets, questionnaires, paper work, and general bank items can be printed by staff
    return { allowed: true };
  }

  const inWindow = isNearExamWindow(
    {
      examWindowStart: target.examWindowStart,
      examWindowEnd: target.examWindowEnd,
      nearExamDays,
    },
    now,
  );

  if (inWindow) {
    // Inside near-exam or active exam window: restricted to exam approvers and school administrators
    if (viewer.isExamApprover || viewer.role === Role.CAMPUS_ADMIN) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "Printing exam materials during the near-exam window is restricted to exam approvers and administrators.",
    };
  }

  // Outside near-exam window, teachers may print
  return { allowed: true };
}

/**
 * Validates whether a pupil is permitted to print a practice session or form response.
 */
export function canPupilPrintAttempt(attempt: { status?: string; finishedAt?: Date | string | null }): {
  allowed: boolean;
  reason?: string;
} {
  if (attempt.finishedAt !== undefined) {
    // PracticeSession check
    if (attempt.finishedAt === null) {
      return {
        allowed: false,
        reason: "Pupils may only print completed practice sessions.",
      };
    }
    return { allowed: true };
  }

  if (attempt.status !== undefined) {
    // FormResponse check
    if (attempt.status !== "COMPLETED") {
      return {
        allowed: false,
        reason: "Pupils may only print completed submissions.",
      };
    }
    return { allowed: true };
  }

  return { allowed: true };
}

/**
 * Formats a tamper-evident watermark string for printed examination and practice materials.
 */
export function generateWatermarkText(params: {
  actorName: string;
  actorIdentifier: string;
  branchName?: string;
  targetTitle: string;
  timestamp?: Date;
  recipientStudentName?: string;
  recipientStudentAdmissionNo?: string;
}): string {
  const ts = (params.timestamp ?? new Date()).toISOString().replace("T", " ").substring(0, 19) + " UTC";
  const branch = params.branchName ? ` [${params.branchName}]` : "";

  if (params.recipientStudentName) {
    const adm = params.recipientStudentAdmissionNo ? ` (${params.recipientStudentAdmissionNo})` : "";
    return `ISSUED BY: ${params.actorName} • HANDOUT FOR: ${params.recipientStudentName}${adm} • ${ts} • OCTALVE EDU${branch}`;
  }

  return `${params.actorName} (${params.actorIdentifier}) • ${params.targetTitle} • ${ts} • OCTALVE EDU${branch}`;
}

/**
 * Sanitizes and escapes text for PDF string literals enclosed in parentheses `(...)`.
 */
export function escapePdfText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n\t]/g, " ")
    .replace(/[^\x20-\x7E]/g, "?");
}

/**
 * Breaks long text lines into wrapped chunks fitting within specified character width.
 */
export function wrapText(text: string, maxCharsPerLine = 75): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
    } else if (currentLine.length + word.length + 1 <= maxCharsPerLine) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

/**
 * Pure TypeScript PDF 1.4 Binary Generator.
 * Generates valid standard PDF bytes conforming to ISO 32000-1 / PDF-1.4 with:
 * - A4 portrait page boxes (595.28 x 841.89 pt)
 * - Automatic pagination and clean margins
 * - Running headers and footers with page numbers
 * - Multi-page diagonal center watermarks (ISO 32000 watermark rendering)
 * - Structured question layout with points, options, and student/teacher keys
 */
export function generateExamPdf(doc: PrintableDocument): Buffer {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 50;
  const marginTop = 770;
  const marginBottom = 60;

  const pagesCommands: string[] = [];
  let currentCommands: string[] = [];
  let currentY = marginTop;

  function startNewPage() {
    if (currentCommands.length > 0) {
      pagesCommands.push(currentCommands.join("\n"));
      currentCommands = [];
    }
    currentY = marginTop;
  }

  function checkSpace(neededHeight: number) {
    if (currentY - neededHeight < marginBottom) {
      startNewPage();
    }
  }

  // First page document header
  currentCommands.push(
    // School Title Header
    `BT /F2 16 Tf ${marginX} ${currentY} Td (${escapePdfText(doc.branchName || "OCTALVE EDU")}) Tj ET`,
  );
  currentY -= 20;

  const docKind = doc.kindLabel || "EXAMINATION & PRACTICE PAPER";
  currentCommands.push(`BT /F2 13 Tf ${marginX} ${currentY} Td (${escapePdfText(docKind)}: ${escapePdfText(doc.title)}) Tj ET`);
  currentY -= 18;

  const metaParts: string[] = [`Date: ${doc.date}`];
  if (doc.classGroupName) metaParts.push(`Class: ${doc.classGroupName}`);
  if (doc.totalPoints !== undefined) metaParts.push(`Max Marks: ${doc.totalPoints}`);
  metaParts.push(`Questions: ${doc.questions.length}`);

  currentCommands.push(`BT /F1 9 Tf ${marginX} ${currentY} Td (${escapePdfText(metaParts.join("   |   "))}) Tj ET`);
  currentY -= 15;

  // Horizontal divider line
  currentCommands.push(`0.5 w 0.8 0.8 0.8 RG ${marginX} ${currentY} m ${pageWidth - marginX} ${currentY} l S 0 0 0 RG`);
  currentY -= 18;

  if (doc.instructions) {
    const instrLines = wrapText(`Instructions: ${doc.instructions}`, 80);
    for (const line of instrLines) {
      checkSpace(14);
      currentCommands.push(`BT /F1 9 Tf ${marginX} ${currentY} Td (${escapePdfText(line)}) Tj ET`);
      currentY -= 14;
    }
    currentY -= 8;
  }

  // Questions
  doc.questions.forEach((q, idx) => {
    checkSpace(50);

    const qNum = `Question ${idx + 1}`;
    const pts = q.points !== undefined ? ` [${q.points} Mark${q.points === 1 ? "" : "s"}]` : "";
    const typeLabel = q.questionType ? ` (${q.questionType})` : "";
    const qHeader = `${qNum}${typeLabel}${pts}`;

    currentCommands.push(`BT /F2 11 Tf ${marginX} ${currentY} Td (${escapePdfText(qHeader)}) Tj ET`);
    currentY -= 15;

    // Prompt lines
    const promptLines = wrapText(q.prompt, 75);
    for (const line of promptLines) {
      checkSpace(14);
      currentCommands.push(`BT /F1 10 Tf ${marginX + 10} ${currentY} Td (${escapePdfText(line)}) Tj ET`);
      currentY -= 14;
    }

    // Options (for multiple choice)
    if (q.options && q.options.length > 0) {
      currentY -= 4;
      const letters = ["A", "B", "C", "D", "E", "F"];
      q.options.forEach((opt, optIdx) => {
        checkSpace(14);
        const prefix = letters[optIdx] ? `(${letters[optIdx]}) ` : "• ";
        currentCommands.push(`BT /F1 9.5 Tf ${marginX + 20} ${currentY} Td (${escapePdfText(prefix + opt)}) Tj ET`);
        currentY -= 13;
      });
    }

    // Student Answer (if provided)
    if (q.studentAnswer !== undefined && q.studentAnswer !== null) {
      checkSpace(16);
      currentY -= 4;
      const statusIcon = q.isCorrect === true ? "[CORRECT] " : q.isCorrect === false ? "[INCORRECT] " : "";
      currentCommands.push(
        `BT /F2 9.5 Tf ${marginX + 15} ${currentY} Td (${escapePdfText(statusIcon + "Student Answer: " + q.studentAnswer)}) Tj ET`,
      );
      currentY -= 14;
    } else if (!q.correctAnswer) {
      // Blank answer line for student paper
      checkSpace(20);
      currentY -= 6;
      currentCommands.push(
        `BT /F1 9 Tf ${marginX + 15} ${currentY} Td (Student Answer: _____________________________________________________) Tj ET`,
      );
      currentY -= 16;
    }

    // Awarded Score
    if (q.awardedScore !== undefined && q.awardedScore !== null) {
      checkSpace(14);
      currentCommands.push(
        `BT /F1 9 Tf ${marginX + 15} ${currentY} Td (${escapePdfText(`Score Awarded: ${q.awardedScore} / ${q.points ?? 1}`)}) Tj ET`,
      );
      currentY -= 13;
    }

    // Correct Answer & Explanation (if included in teacher scheme or review)
    if (q.correctAnswer) {
      checkSpace(15);
      currentY -= 2;
      currentCommands.push(`BT /F2 9.5 Tf ${marginX + 15} ${currentY} Td (${escapePdfText("Answer Key: " + q.correctAnswer)}) Tj ET`);
      currentY -= 14;
    }

    if (q.explanation) {
      const expLines = wrapText(`Explanation: ${q.explanation}`, 70);
      for (const line of expLines) {
        checkSpace(13);
        currentCommands.push(`BT /F1 8.5 Tf ${marginX + 20} ${currentY} Td (${escapePdfText(line)}) Tj ET`);
        currentY -= 13;
      }
    }

    if (q.feedback) {
      const fbLines = wrapText(`Teacher Feedback: ${q.feedback}`, 70);
      for (const line of fbLines) {
        checkSpace(13);
        currentCommands.push(`BT /F1 8.5 Tf ${marginX + 20} ${currentY} Td (${escapePdfText(line)}) Tj ET`);
        currentY -= 13;
      }
    }

    currentY -= 12; // Spacing between questions
  });

  if (currentCommands.length > 0) {
    pagesCommands.push(currentCommands.join("\n"));
  }

  const totalPages = pagesCommands.length;
  const escapedWatermark = escapePdfText(doc.watermark);

  // Finalize each page with watermark, header, and footer
  const finalizedPages = pagesCommands.map((content, pageIndex) => {
    const pageNum = pageIndex + 1;
    const headerFooter = [
      // Running top watermark line
      `BT /F1 7.5 Tf ${marginX} 818 Td (CONFIDENTIAL WATERMARK: ${escapedWatermark}) Tj ET`,
      `0.5 w 0.85 0.85 0.85 RG ${marginX} 812 m ${pageWidth - marginX} 812 l S 0 0 0 RG`,

      // Diagonal center watermark
      `q`,
      `0.88 0.88 0.88 rg`,
      `0.7071 0.7071 -0.7071 0.7071 297 420 cm`,
      `BT /F2 16 Tf -160 0 Td (${escapedWatermark}) Tj ET`,
      `Q`,

      // Running bottom footer line
      `0.5 w 0.85 0.85 0.85 RG ${marginX} 42 m ${pageWidth - marginX} 42 l S 0 0 0 RG`,
      `BT /F1 8 Tf ${marginX} 30 Td (Page ${pageNum} of ${totalPages}   |   ${doc.branchName || "Octalve"} Examination System) Tj ET`,
      `BT /F1 7.5 Tf ${pageWidth - marginX - 160} 30 Td (${escapedWatermark.substring(0, 35)}...) Tj ET`,
    ].join("\n");

    return `${headerFooter}\n${content}`;
  });

  // Construct PDF objects
  const font1ObjNum = 3 + totalPages;
  const font2ObjNum = 3 + totalPages + 1;
  const firstStreamObjNum = 3 + totalPages + 2;

  const objects: string[] = [];

  // Object 1: Catalog
  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);

  // Object 2: Pages
  const kidsRefs = Array.from({ length: totalPages }, (_, i) => `${3 + i} 0 R`).join(" ");
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [${kidsRefs}] /Count ${totalPages} >>\nendobj\n`);

  // Page objects 3 .. (3 + totalPages - 1)
  finalizedPages.forEach((_, i) => {
    const pageObjNum = 3 + i;
    const streamObjNum = firstStreamObjNum + i;
    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${streamObjNum} 0 R /Resources << /Font << /F1 ${font1ObjNum} 0 R /F2 ${font2ObjNum} 0 R >> >> >>\nendobj\n`,
    );
  });

  // Fonts
  objects.push(`${font1ObjNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);
  objects.push(`${font2ObjNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`);

  // Page Content Streams
  finalizedPages.forEach((streamContent, i) => {
    const streamObjNum = firstStreamObjNum + i;
    const streamLen = Buffer.byteLength(streamContent, "utf8");
    objects.push(`${streamObjNum} 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream\nendobj\n`);
  });

  // Assemble full PDF with xref table
  let pdfContent = `%PDF-1.4\n%\xE2\xE3\xCF\xD3\n`;
  const offsets: number[] = [];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdfContent, "utf8"));
    pdfContent += obj;
  }

  const startXref = Buffer.byteLength(pdfContent, "utf8");
  const totalObjCount = objects.length + 1;

  let xref = `xref\n0 ${totalObjCount}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += String(offset).padStart(10, "0") + " 00000 n \n";
  }

  const trailer = `trailer\n<< /Size ${totalObjCount} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  pdfContent += xref + trailer;

  return Buffer.from(pdfContent, "utf8");
}
