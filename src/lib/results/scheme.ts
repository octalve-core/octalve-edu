import { EnrollmentStatus } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";

// Which assessment scheme a result is entered under, and which marks that means (task 0032). One place, used by the Marks sheet (what the screen asks for) and by the save (what it accepts), so the
// two cannot disagree.
//
// The scheme: a class group's own live scheme; else the school's live school-wide scheme; else none. The database allows one live scheme per scope (AssessmentScheme_one_live_per_scope), so each
// lookup has one answer.
//
// The marks: a scheme is its components (the continuous-assessment parts) plus the exam, and the scheme rule is "components + exam = total, exactly". A saved result stores its parts as JSON, so the
// exam is one more part of it, out of `examMax`, when there is one (`entryParts`).

export type SchemePart = { name: string; maxScore: number };
export type SchemeWithParts = {
  id: string;
  name: string;
  totalMax: number;
  examMax: number;
  /// What the school calls the exam part (task 0048); null = the default, "Exam".
  examName: string | null;
  /// The scheme's continuous-assessment components, as it defines them.
  components: SchemePart[];
  /// What a result is entered under: the components, then the exam when there is one.
  parts: SchemePart[];
};

/// The parts a result is entered under: the components in order, then the exam out of `examMax` when `examMax` is above 0 (0 means no exam). The exam is called what the school named it (`examName`, task
/// 0048: the scheme refuses a name a component already has); with no name given it is "Exam", and if a component is already called "Exam" (ignoring case) it is "Final exam", then "Examination", then
/// "Exam 2", "Exam 3"…, so the names stay unique.
export function entryParts(components: readonly SchemePart[], examMax: number, examName?: string | null): SchemePart[] {
  if (!(examMax > 0)) return components.map((c) => ({ ...c }));
  if (examName) return [...components.map((c) => ({ ...c })), { name: examName, maxScore: examMax }];
  const taken = new Set(components.map((c) => c.name.toLowerCase()));
  const candidates = ["Exam", "Final exam", "Examination"];
  let name = candidates.find((candidate) => !taken.has(candidate.toLowerCase()));
  for (let n = 2; name === undefined; n += 1) if (!taken.has(`exam ${n}`)) name = `Exam ${n}`;
  return [...components.map((c) => ({ ...c })), { name, maxScore: examMax }];
}

const withParts = { include: { components: { orderBy: { sortOrder: "asc" as const } } } };

type Row = {
  id: string;
  name: string;
  totalMax: { toString(): string };
  examMax: { toString(): string };
  examName: string | null;
  components: { name: string; maxScore: { toString(): string } }[];
};

const view = (row: Row): SchemeWithParts => {
  const components = row.components.map((c) => ({ name: c.name, maxScore: Number(c.maxScore) }));
  const examMax = Number(row.examMax);
  return {
    id: row.id,
    name: row.name,
    totalMax: Number(row.totalMax),
    examMax,
    examName: row.examName,
    components,
    parts: entryParts(components, examMax, row.examName),
  };
};

/// The school's live school-wide scheme, or null.
export async function schoolWideScheme(tx: Tx, tenantId: string): Promise<SchemeWithParts | null> {
  const row = await tx.assessmentScheme.findFirst({ where: { tenantId, classGroupId: null, archivedAt: null }, ...withParts });
  return row ? view(row) : null;
}

/// The scheme of one class group: its own live one, else the school-wide one, else null.
export async function schemeForClassGroup(tx: Tx, tenantId: string, classGroupId: string): Promise<SchemeWithParts | null> {
  const own = await tx.assessmentScheme.findFirst({ where: { tenantId, classGroupId, archivedAt: null }, ...withParts });
  return own ? view(own) : schoolWideScheme(tx, tenantId);
}

/// The scheme each of these pupils is entered under in the period's session: from the class group of their ACTIVE enrolment there. A pupil with no active enrolment in that session (an
/// administrator may save one) gets the school-wide scheme, or none. Every id asked about is in the map.
export async function schemesForStudents(
  tx: Tx,
  tenantId: string,
  sessionId: string,
  studentIds: readonly string[],
): Promise<Map<string, SchemeWithParts | null>> {
  const enrolments = studentIds.length
    ? await tx.studentEnrollment.findMany({
        where: { tenantId, sessionId, status: EnrollmentStatus.ACTIVE, studentId: { in: [...studentIds] } },
        select: { studentId: true, classArm: { select: { classGroupId: true } } },
      })
    : [];
  const groupOf = new Map(enrolments.map((e) => [e.studentId, e.classArm.classGroupId]));
  const groupIds = [...new Set(groupOf.values())];
  const own = groupIds.length
    ? await tx.assessmentScheme.findMany({ where: { tenantId, classGroupId: { in: groupIds }, archivedAt: null }, ...withParts })
    : [];
  const ownByGroup = new Map(own.map((row) => [row.classGroupId as string, view(row)]));
  const fallback = await schoolWideScheme(tx, tenantId);
  return new Map(studentIds.map((id) => [id, (groupOf.has(id) ? ownByGroup.get(groupOf.get(id) as string) : undefined) ?? fallback]));
}

const listOf = (scheme: SchemeWithParts) => scheme.parts.map((c) => `${c.name} (out of ${c.maxScore})`).join(", ");

/// Why `parts` are not the scheme's parts, in a sentence a teacher can act on; null when they are exactly the scheme's (the same names, each with the scheme's maximum; order is free).
export function partsProblem(scheme: SchemeWithParts, parts: readonly SchemePart[]): string | null {
  const expected = new Map(scheme.parts.map((c) => [c.name, c.maxScore]));
  const seen = new Set<string>();
  for (const part of parts) {
    if (seen.has(part.name)) return `"${part.name}" is sent twice. The scheme "${scheme.name}" has: ${listOf(scheme)}.`;
    seen.add(part.name);
    const max = expected.get(part.name);
    if (max === undefined) return `"${part.name}" is not a part of the scheme "${scheme.name}". It has: ${listOf(scheme)}.`;
    if (max !== part.maxScore) return `"${part.name}" is out of ${part.maxScore} here but out of ${max} in the scheme "${scheme.name}".`;
  }
  const missing = scheme.parts.filter((c) => !seen.has(c.name));
  if (missing.length > 0)
    return `The scheme "${scheme.name}" also needs ${missing.map((c) => `"${c.name}"`).join(", ")}. It has: ${listOf(scheme)}.`;
  return null;
}

/// Why one pupil's entry cannot be saved under `scheme` (null when it can): a total out of something other than the scheme's total, a bare score where the scheme has parts, parts the scheme
/// does not have, or parts sent where the scheme has none.
export function entryProblem(scheme: SchemeWithParts, entry: { maxScore?: number; components?: readonly SchemePart[] }): string | null {
  if (entry.maxScore !== undefined && entry.maxScore !== scheme.totalMax)
    return `The scheme "${scheme.name}" is out of ${scheme.totalMax}, not ${entry.maxScore}.`;
  const parts = entry.components ?? [];
  if (scheme.parts.length === 0) return parts.length > 0 ? `The scheme "${scheme.name}" has no parts; send the score alone.` : null;
  if (parts.length === 0) return `The scheme "${scheme.name}" has parts: ${listOf(scheme)}. Send a score for each.`;
  return partsProblem(scheme, parts);
}
