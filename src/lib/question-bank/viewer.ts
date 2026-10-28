import type { Role } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";
import { normalizeLabel } from "@/lib/question-bank/labels";
import type { BankViewer } from "@/lib/question-bank/rules";

/// Everything `rules.ts` needs to know about the person asking, read fresh inside the transaction that changes anything: their ACTIVE membership of THIS school (a person has one
/// per school), whether they are the school's administrator (an active ADMIN membership), their reviewer rows, and the subjects they teach folded to keys.
///
/// "The subjects they teach" are the person's `StaffSubjectAssignment` rows reached through `StaffRecord.userId`. A `Subject` is a school-wide row with a free-text name, while the
/// bank's `subjectKey` is the normalised name, so a teacher's subjects are the distinct folded names of those rows, for the campus of their staff record (none = the whole
/// school). An archived subject, or an archived staff record, counts as no subject.
///
/// Called inside a transaction when a decision is being taken, so a person removed or deactivated a moment ago is not trusted on a read from before.
export async function loadViewer(tx: Tx, tenantId: string, userId: string): Promise<BankViewer> {
  const [memberships, reviewerRows, assignments] = await Promise.all([
    tx.tenantMembership.findMany({ where: { tenantId, userId, deactivatedAt: null }, select: { campusId: true, role: true } }),
    tx.questionBankReviewer.findMany({
      where: { tenantId, userId },
      select: { campusId: true, scope: true, subjectKey: true, isExamApprover: true },
    }),
    tx.staffSubjectAssignment.findMany({
      where: { tenantId, staffRecord: { userId, archivedAt: null }, subject: { archivedAt: null } },
      select: { staffRecord: { select: { campusId: true } }, subject: { select: { name: true } } },
    }),
  ]);

  const seen = new Set<string>();
  const teaches: BankViewer["teaches"][number][] = [];
  for (const row of assignments) {
    const subjectKey = normalizeLabel(row.subject.name);
    if (!subjectKey) continue;
    const campusId = row.staffRecord.campusId;
    const id = `${campusId ?? ""}\u0000${subjectKey}`;
    if (seen.has(id)) continue;
    seen.add(id);
    teaches.push({ campusId, subjectKey });
  }

  return {
    userId,
    isSchoolAdmin: memberships.some((m: { role: Role }) => m.role === "ADMIN"),
    memberships,
    reviewerRows,
    teaches,
  };
}
