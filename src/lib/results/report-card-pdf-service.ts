import type { Tx } from "@/lib/tenant/for-tenant";
import { getStudentReportCard } from "./service";
import { classRoster, type SheetCaller } from "./sheet";
import { renderReportCardsPdf, type PdfCard } from "./report-card-pdf";
import type { ResultFailure } from "./http";

// Report cards as PDF files (task 0038): one pupil's, and a whole class's in one file. The data comes from the same reads as the screen (`getStudentReportCard`, `classRoster`), so every rule that
// decides what a person may see (the arm a teacher teaches, the campus, the payment gate, which results a pupil sees, when remarks are shown) applies unchanged and is not repeated here.

/// A class file holds at most this many cards: a PDF is built in memory in the request, and no real class is larger.
export const MAX_CARDS_PER_FILE = 100;

export type PdfFailure = { ok: false; failure: ResultFailure; message?: string };
export type PdfFile = { ok: true; pdf: Buffer; filename: string; pages: number; cards: number; unsupported: number };

/// A name that is safe in a download's file name: letters and digits, the rest one dash.
const safe = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "card";

type CardResult = Awaited<ReturnType<typeof getStudentReportCard>>;
type CardData = Extract<CardResult, { data: unknown }>["data"];
/// The card reads declare `ok: boolean` on a failure, so the success is told by the data it carries.
const hasData = (res: CardResult): res is Extract<CardResult, { data: unknown }> => "data" in res;
const toPdfCard = (data: CardData): PdfCard => ({
  student: data.student,
  period: data.period,
  summary: data.summary,
  subjects: data.subjects,
  remarks: { teacher: data.remarks.teacher, principal: data.remarks.principal },
});

async function institutionOf(tx: Tx, tenantId: string): Promise<string> {
  return (await tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }))?.name ?? "Report card";
}

/// One pupil's card. A pupil or a parent who is held by the payment gate gets the same refusal as from the card itself.
export async function singleCardPdf(
  tx: Tx,
  tenantId: string,
  viewer: { role: string; userId: string },
  studentId: string,
  periodId: string,
  origin: string,
  now: Date = new Date(),
): Promise<PdfFile | PdfFailure> {
  const res = await getStudentReportCard(tx, tenantId, studentId, periodId, viewer.role, viewer.userId);
  if (!hasData(res)) return { ok: false, failure: res.failure, message: "message" in res ? res.message : undefined };
  const rendered = renderReportCardsPdf([toPdfCard(res.data)], {
    institution: await institutionOf(tx, tenantId),
    generatedAt: now,
    origin,
  });
  await tx.auditLog.create({
    data: {
      tenantId,
      actorUserId: viewer.userId,
      action: "REPORT_CARD_PDF_DOWNLOADED",
      targetType: "StudentRecord",
      targetId: studentId,
      afterValue: { periodId, role: viewer.role, pages: rendered.pages },
    },
  });
  return {
    ok: true,
    pdf: rendered.pdf,
    filename: `report-card-${safe(res.data.student.admissionNo)}-${safe(res.data.period.label)}.pdf`,
    pages: rendered.pages,
    cards: 1,
    unsupported: rendered.unsupported,
  };
}

/// Every pupil on the roll of an arm for a term, one card each, in one file. Who may read the arm is `classRoster`'s rule; a card of a pupil the caller may not read is never built.
export async function classCardsPdf(
  tx: Tx,
  tenantId: string,
  caller: SheetCaller,
  query: { periodId: string; classArmId: string },
  origin: string,
  now: Date = new Date(),
): Promise<PdfFile | PdfFailure> {
  const roster = await classRoster(tx, tenantId, caller, query);
  if (!roster.ok) return { ok: false, failure: roster.failure, message: roster.message };
  const rows = roster.data.rows;
  if (rows.length === 0) return { ok: false, failure: "NOT_FOUND", message: "Nobody was on the roll of this class for this term." };
  if (rows.length > MAX_CARDS_PER_FILE)
    return {
      ok: false,
      failure: "TOO_MANY_CARDS",
      message: `This class has ${rows.length} pupils; a file holds at most ${MAX_CARDS_PER_FILE} report cards.`,
    };
  const cards: PdfCard[] = [];
  for (const row of rows) {
    const res = await getStudentReportCard(tx, tenantId, row.studentId, query.periodId, caller.role, caller.userId);
    // The roster names only pupils this caller may read; a card that still cannot be built is a fault, not a pupil to skip silently.
    if (!hasData(res)) return { ok: false, failure: res.failure, message: "message" in res ? res.message : undefined };
    cards.push(toPdfCard(res.data));
  }
  const rendered = renderReportCardsPdf(cards, { institution: await institutionOf(tx, tenantId), generatedAt: now, origin });
  await tx.auditLog.create({
    data: {
      tenantId,
      actorUserId: caller.userId,
      action: "REPORT_CARDS_PDF_DOWNLOADED",
      targetType: "ClassArm",
      targetId: query.classArmId,
      afterValue: { periodId: query.periodId, pupils: cards.length, pages: rendered.pages },
    },
  });
  return {
    ok: true,
    pdf: rendered.pdf,
    filename: `report-cards-${safe(roster.data.arm.classGroupName)}-${safe(roster.data.arm.name)}-${safe(roster.data.period.label)}.pdf`,
    pages: rendered.pages,
    cards: cards.length,
    unsupported: rendered.unsupported,
  };
}
