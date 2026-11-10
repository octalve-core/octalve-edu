import crypto from "node:crypto";
import type { Tx } from "@/lib/tenant/for-tenant";
import { auditAcademic } from "@/lib/academics/sessions";
import { fileNamePart } from "./file-name";
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  columnHeader,
  markColumns,
  planImport,
  templateCsv,
  type MarkColumn,
  type Plan,
  type PlanRow,
  type RollEntry,
} from "./mark-import";
import { recordStudentResults, type ServiceResult } from "./service";
import { getSheet, type SheetCaller } from "./sheet";

// Importing a class's marks for one subject from a CSV file (task 0039). The sheet is read with `getSheet`, so who may see it, which pupils are on it and which scheme it is under are the Marks tab's
// own answers; the file is judged by the pure rules in `mark-import.ts`; and only when every row is fine are the new and changed rows handed to `recordStudentResults` IN THE SAME TRANSACTION, the single
// writer of marks, so the scheme's parts and total, the DRAFT-only rule, a teacher's assignment, the scheme lock on first save, the grade letter and the score audit are its rules and not a copy of them.
// All or nothing, and a dry run writes nothing at all (it does not even lock the scheme).

type Query = { periodId: string; classArmId: string; subjectId: string };
type Sheet = Extract<Awaited<ReturnType<typeof getSheet>>, { ok: true }>["data"];

/// The columns of a sheet and the pupils on its roll with what is saved, in the sheet's order.
function layout(sheet: Sheet): { columns: MarkColumn[]; roll: RollEntry[] } {
  const columns = markColumns(sheet.scheme.parts, sheet.scheme.totalMax);
  const single = sheet.scheme.parts.length === 0;
  const roll: RollEntry[] = sheet.rows.map((row) => ({
    studentId: row.studentId,
    admissionNo: row.admissionNo,
    firstName: row.firstName,
    lastName: row.lastName,
    saved: row.result
      ? {
          status: row.result.status,
          marks: single ? [row.result.score] : columns.map((c) => row.result?.components?.find((x) => x.name === c.name)?.score ?? null),
        }
      : null,
  }));
  return { columns, roll };
}

export type TemplateFile = { csv: string; filename: string; pupils: number };

/// The sheet as a file to fill in: the same pupils, in the same order, with the saved marks in place. Readable by whoever may enter these marks (it is the sheet).
export async function markTemplate(tx: Tx, tenantId: string, caller: SheetCaller, query: Query): Promise<ServiceResult<TemplateFile>> {
  const res = await getSheet(tx, tenantId, caller, query);
  if (!res.ok) return res;
  const { columns, roll } = layout(res.data);
  const s = res.data;
  return {
    ok: true,
    data: {
      csv: templateCsv(columns, roll),
      filename: `marks-${fileNamePart(s.arm.classGroupName, "class")}-${fileNamePart(s.arm.name, "arm")}-${fileNamePart(s.subject.name, "subject")}-${fileNamePart(s.period.label, "term")}.csv`,
      pupils: roll.length,
    },
  };
}

export type ImportReport = {
  dryRun: boolean;
  /// True only when this was a real run with no problems and the marks now exist.
  committed: boolean;
  sheet: { term: string; class: string; subject: string };
  /// The headers the file should have, as the template writes them.
  headers: string[];
  headerProblems: string[];
  counts: Plan["counts"];
  notInFile: number;
  rows: PlanRow[];
  /// What a real run would write (or wrote): the new and changed rows.
  toWrite: number;
  /// SHA-256 of the file as received: what the audit entry records instead of its content.
  fileHash: string;
};

export type ImportInput = Query & { csv: string; dryRun: boolean };

export async function importMarks(
  tx: Tx,
  tenantId: string,
  caller: SheetCaller,
  input: ImportInput,
): Promise<ServiceResult<{ report: ImportReport }>> {
  const bytes = Buffer.byteLength(input.csv, "utf8");
  if (bytes > IMPORT_MAX_BYTES)
    return {
      ok: false,
      failure: "TOO_LARGE",
      message: `That file is too large. A marks file can be at most ${Math.round(IMPORT_MAX_BYTES / 1024)} KB.`,
    };

  const res = await getSheet(tx, tenantId, caller, input);
  if (!res.ok) return res;
  const sheet = res.data;
  const { columns, roll } = layout(sheet);
  const plan = planImport(input.csv, columns, roll);
  if (plan.counts.rows > IMPORT_MAX_ROWS)
    return {
      ok: false,
      failure: "TOO_MANY_ROWS",
      message: `That file has ${plan.counts.rows} rows. A file can have at most ${IMPORT_MAX_ROWS}; split it and import the parts.`,
    };

  const fileHash = crypto.createHash("sha256").update(input.csv, "utf8").digest("hex");
  const report = (committed: boolean): ImportReport => ({
    dryRun: input.dryRun,
    committed,
    sheet: { term: sheet.period.label, class: `${sheet.arm.classGroupName} ${sheet.arm.name}`, subject: sheet.subject.name },
    headers: ["admission_no", "name", ...columns.map(columnHeader)],
    headerProblems: plan.headerProblems,
    counts: plan.counts,
    notInFile: plan.notInFile,
    rows: plan.rows,
    toWrite: plan.entries.length,
    fileHash,
  });

  // A check, a file with any problem, or a file with nothing new in it writes nothing.
  if (input.dryRun || plan.headerProblems.length > 0 || plan.counts.errors > 0 || plan.entries.length === 0)
    return { ok: true, data: { report: report(false) } };

  // Every row is fine: the writer takes it from here, in this transaction. It decides every refusal before its first write, so a refusal it makes (a scheme edited since the sheet was read, a result
  // sent for review since) leaves nothing behind.
  const single = sheet.scheme.parts.length === 0;
  const written = await recordStudentResults(
    tx,
    tenantId,
    caller.userId,
    {
      periodId: input.periodId,
      subjectId: input.subjectId,
      results: plan.entries.map((entry) =>
        single
          ? { studentId: entry.studentId, score: entry.marks[0], maxScore: sheet.scheme.totalMax }
          : {
              studentId: entry.studentId,
              maxScore: sheet.scheme.totalMax,
              components: columns.map((c, i) => ({ name: c.name, score: entry.marks[i], maxScore: c.maxScore })),
            },
      ),
    },
    { role: caller.role, campusId: caller.campusId },
  );
  if (!written.ok) return written;

  await auditAcademic(tx, tenantId, caller.userId, "ClassArm", "RESULTS_IMPORTED", sheet.arm.id, undefined, {
    periodId: sheet.period.id,
    subjectId: sheet.subject.id,
    rows: plan.counts.rows,
    new: plan.counts.new,
    changed: plan.counts.changed,
    unchanged: plan.counts.unchanged,
    blank: plan.counts.blank,
    fileSha256: fileHash,
  });
  return { ok: true, data: { report: report(true) } };
}
