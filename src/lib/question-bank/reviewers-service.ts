import { Prisma, Role } from "@prisma/client";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import { writeBankAudit } from "@/lib/question-bank/audit";
import { normalizeLabel } from "@/lib/question-bank/labels";
import { hasForbiddenCharacters } from "@/lib/question-bank/validation";

// Who may review question bank submissions (design note sections 6 and 8.1, parity note D5). A reviewer is a MEMBER OF THIS SCHOOL who is active staff (an administrator, a
// teacher or other staff: never a pupil or a parent), for one campus or, when `campusId` is null, for every campus of the school (only the school's administrator assigns
// those). GENERAL covers every subject; SUBJECT names one (the label as typed plus its normalised key). `isExamApprover` marks someone who sees overlap warnings and sets
// visibility. Every assignment and removal is audited in the same transaction. The routes decide who may call and verify the fresh re-authentication; the rules about WHAT
// are here. A reviewer is a membership with a scope, not a new `Permission`: ADMIN implying every permission (ADR 0006) does not apply to reviewing.

type TenantCtx = TenantAuthContext["tenant"];

const STAFF: readonly Role[] = [Role.ADMIN, Role.CAMPUS_ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF];

export type ReviewerView = {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  /// null = a reviewer for every campus of the school.
  campusId: string | null;
  scope: "GENERAL" | "SUBJECT";
  subjectLabel: string | null;
  isExamApprover: boolean;
  createdAt: Date;
  /// Shown to a campus administrator for a school-wide reviewer they cannot remove.
  inherited: boolean;
};

const SELECT = {
  id: true,
  userId: true,
  campusId: true,
  scope: true,
  subjectLabel: true,
  isExamApprover: true,
  createdAt: true,
  member: { select: { user: { select: { name: true, email: true } } } },
} satisfies Prisma.QuestionBankReviewerSelect;

type Row = Prisma.QuestionBankReviewerGetPayload<{ select: typeof SELECT }>;

const view = (row: Row, forCampus: string | null): ReviewerView => ({
  id: row.id,
  userId: row.userId,
  name: row.member.user.name,
  email: row.member.user.email,
  campusId: row.campusId,
  scope: row.scope,
  subjectLabel: row.subjectLabel,
  isExamApprover: row.isExamApprover,
  createdAt: row.createdAt,
  inherited: row.campusId === null && forCampus !== null,
});

/// The reviewers of one campus plus the school-wide ones; with `campusId` null, every row of the school (the school administrator's view).
export async function listReviewers(tenant: TenantCtx, campusId: string | null): Promise<ReviewerView[]> {
  const { tenantId } = tenant;
  return tenant.run(async (tx) => {
    const rows = await tx.questionBankReviewer.findMany({
      where: { tenantId, ...(campusId ? { OR: [{ campusId }, { campusId: null }] } : {}) },
      select: SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 500,
    });
    return rows.map((row) => view(row, campusId));
  });
}

export type Fail = {
  ok: false;
  status: 400 | 403 | 404 | 409;
  code: "VALIDATION" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT";
  message: string;
};
const refuse = (status: Fail["status"], code: Fail["code"], message: string): Fail => ({ ok: false, status, code, message });
const NOT_FOUND = refuse(404, "NOT_FOUND", "Not found");

type Actor = { actorUserId: string; actorRole: Role; actorCampusId: string | null; stepUpVerifiedAt: Date };

export type AddReviewerInput = Actor & {
  /// null = every campus of the school.
  campusId: string | null;
  userId: string;
  scope: "GENERAL" | "SUBJECT";
  subjectLabel?: string | null;
  isExamApprover: boolean;
};

export async function addReviewer(tenant: TenantCtx, input: AddReviewerInput): Promise<{ ok: true; reviewer: ReviewerView } | Fail> {
  const { tenantId } = tenant;
  const isAdmin = input.actorRole === "ADMIN";
  if (!isAdmin) {
    // a campus administrator assigns for their own campus only: not for the whole school, and any other campus is no campus of theirs
    if (input.actorRole !== "CAMPUS_ADMIN" || input.actorCampusId === null)
      return refuse(403, "FORBIDDEN", "Only an administrator can assign reviewers.");
    if (input.campusId === null) return refuse(403, "FORBIDDEN", "Only a school administrator can assign a reviewer for every campus.");
    if (input.campusId !== input.actorCampusId) return NOT_FOUND;
  }

  let subjectLabel: string | null = null;
  let subjectKey: string | null = null;
  if (input.scope === "SUBJECT") {
    subjectLabel = (input.subjectLabel ?? "").replace(/\s+/g, " ").trim();
    subjectKey = normalizeLabel(subjectLabel);
    if (!subjectLabel || !subjectKey)
      return refuse(400, "VALIDATION", "A subject reviewer needs a subject name with at least one letter or digit.");
    if (subjectLabel.length > 80 || hasForbiddenCharacters(subjectLabel))
      return refuse(400, "VALIDATION", "A subject name is at most 80 characters, without control or invisible characters.");
  } else if (input.subjectLabel) {
    return refuse(400, "VALIDATION", "A general reviewer covers every subject, so it names none.");
  }

  try {
    return await tenant.run(async (tx): Promise<{ ok: true; reviewer: ReviewerView } | Fail> => {
      if (input.campusId !== null) {
        const campus = await tx.campus.findFirst({ where: { id: input.campusId, tenantId }, select: { id: true } });
        if (!campus) return NOT_FOUND; // another school's campus is, to this one, a campus that does not exist
      }
      // An active member of THIS school with a staff role; a pupil's or a parent's membership, or a deactivated one, does not count. For a campus, the membership is of that
      // campus or of the whole school (no campus); for every campus, any staff membership of the school.
      const staff = await tx.tenantMembership.findFirst({
        where: {
          tenantId,
          userId: input.userId,
          deactivatedAt: null,
          role: { in: [...STAFF] },
          ...(input.campusId ? { OR: [{ campusId: input.campusId }, { campusId: null }] } : {}),
        },
        select: { id: true },
      });
      if (!staff)
        return refuse(
          400,
          "VALIDATION",
          input.campusId ? "That person is not active staff on this campus." : "That person is not active staff in this school.",
        );

      const row = await tx.questionBankReviewer.create({
        data: {
          tenantId,
          userId: input.userId,
          campusId: input.campusId,
          scope: input.scope,
          subjectLabel,
          subjectKey,
          isExamApprover: input.isExamApprover,
          assignedById: input.actorUserId,
        },
        select: SELECT,
      });
      await writeBankAudit(tx, {
        tenantId,
        campusId: input.campusId,
        actorUserId: input.actorUserId,
        entity: "REVIEWER",
        action: "ASSIGNED",
        ref: row.id,
        newValue: { userId: input.userId, scope: input.scope, subjectLabel, isExamApprover: input.isExamApprover },
        stepUpVerifiedAt: input.stepUpVerifiedAt,
      });
      return { ok: true, reviewer: view(row, input.campusId) };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return refuse(409, "CONFLICT", "That person is already a reviewer for this campus and subject.");
    throw error;
  }
}

export type RemoveReviewerInput = Actor & { id: string };

/// Removes one assignment. Unknown, another school's and another campus's are the same answer (404); a school-wide row a campus administrator may see but not change is a 403
/// (the campus-scope rule everywhere else in the product, ADR 0016).
export async function removeReviewer(tenant: TenantCtx, input: RemoveReviewerInput): Promise<{ ok: true } | Fail> {
  const { tenantId } = tenant;
  return tenant.run(async (tx): Promise<{ ok: true } | Fail> => {
    const row = await tx.questionBankReviewer.findFirst({
      where: { id: input.id, tenantId },
      select: { id: true, userId: true, campusId: true, scope: true, subjectLabel: true, isExamApprover: true },
    });
    if (!row) return NOT_FOUND;
    if (input.actorRole !== "ADMIN") {
      if (input.actorRole !== "CAMPUS_ADMIN" || input.actorCampusId === null)
        return refuse(403, "FORBIDDEN", "Only an administrator can remove reviewers.");
      if (row.campusId === null)
        return refuse(403, "FORBIDDEN", "That reviewer is set for the whole school. Only a school administrator can remove them.");
      if (row.campusId !== input.actorCampusId) return NOT_FOUND;
    }
    // deleteMany, not delete: two people removing the same row at once must not make the second a 500 or write a second audit row.
    const { count } = await tx.questionBankReviewer.deleteMany({ where: { id: row.id, tenantId } });
    if (count === 0) return NOT_FOUND;
    await writeBankAudit(tx, {
      tenantId,
      campusId: row.campusId,
      actorUserId: input.actorUserId,
      entity: "REVIEWER",
      action: "REMOVED",
      ref: row.id,
      oldValue: { userId: row.userId, scope: row.scope, subjectLabel: row.subjectLabel, isExamApprover: row.isExamApprover },
      stepUpVerifiedAt: input.stepUpVerifiedAt,
    });
    return { ok: true };
  });
}
