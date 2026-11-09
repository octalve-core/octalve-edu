import { EnrollmentStatus, SessionStatus, StandingState } from "@prisma/client";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import { asDate, done, namesOf, refuse, today, writeEvent, type HistoryEntry, type Result } from "./common";
import { dayOf, effectiveStanding, mayAct, standingAfter, suspensionEndProblem, type StandingAction } from "./rules";
import { revokeUserSessions } from "@/lib/auth/session";
import { maySuspendSwitch } from "./settings";
import { isExpelledEverywhere } from "./sign-in";

// Standing of a pupil (task 0028, section 4.3): suspended (until a date, or until lifted) or expelled. Suspension changes nothing on the enrolment; expulsion sets the pupil's
// ACTIVE enrolment to EXPELLED, which takes them off every list that selects pupils by ACTIVE enrolment (attendance rolls, invoice generation, result sheets, promotion).
// Who may: the school's administrator for every action; a campus administrator suspends and lifts the pupils of their own campus while the school's ceiling allows it.

type TenantCtx = TenantAuthContext["tenant"];

export type StudentAction = Extract<StandingAction, "SUSPEND" | "LIFT" | "EXPEL" | "REINSTATE">;
export type StudentChange = { reason: string; until?: string | null };

const NOUN: Record<StudentAction, string> = { SUSPEND: "suspend", LIFT: "lift the suspension of", EXPEL: "expel", REINSTATE: "reinstate" };
const NOT_APPLICABLE = (action: StudentAction) =>
  action === "SUSPEND" ? "suspended" : action === "LIFT" ? "not suspended" : action === "EXPEL" ? "already expelled" : "not expelled";

export async function changeStudentStanding(
  tenant: TenantCtx,
  actorUserId: string,
  studentId: string,
  action: StudentAction,
  input: StudentChange,
): Promise<Result<{ standing: string; until: string | null }>> {
  const { tenantId } = tenant;
  const isAdmin = tenant.role === "ADMIN";
  if (!isAdmin && tenant.role !== "CAMPUS_ADMIN") return refuse(403, "FORBIDDEN", "You don't have permission to do that.");

  const until = action === "SUSPEND" ? (input.until ?? null) : null;
  if (action === "SUSPEND") {
    const problem = suspensionEndProblem(until, today());
    if (problem) return refuse(400, "VALIDATION", problem, [{ path: "body.until", message: problem }]);
  }

  // The pupil's account, when this expels them (their sessions end after the change commits, below).
  let expelledUserId: string | null = null;
  const result = await tenant.run(async (tx): Promise<Result<{ standing: string; until: string | null }>> => {
    await tx.$queryRaw`SELECT "id" FROM "StudentRecord" WHERE "tenantId" = ${tenantId} AND "id" = ${studentId} FOR UPDATE`;
    const student = await tx.studentRecord.findFirst({ where: { tenantId, id: studentId } });
    // A pupil of another campus (or a pupil with no campus, to a campus administrator) answers like one that does not exist.
    if (!student || (!isAdmin && (student.campusId === null || student.campusId !== tenant.campusId)))
      return refuse(404, "NOT_FOUND", "That student was not found.");

    const refusal = mayAct(
      action,
      { userId: actorUserId, isAdmin, adminOfCampus: !isAdmin },
      { campusAdminMaySuspend: await maySuspendSwitch.onFor(tx, tenantId, student.campusId) },
    );
    if (refusal)
      return refuse(
        403,
        "FORBIDDEN",
        `Only a school administrator can ${NOUN[action]} a student${action === "SUSPEND" || action === "LIFT" ? " here: the school has taken that from campus administrators" : ""}.`,
      );

    if (student.archivedAt) return refuse(409, "ARCHIVED", "Restore this student first: an archived student's standing can't be changed.");
    const storedUntil = student.standingUntil ? dayOf(student.standingUntil) : null;
    // Lifting works on what is stored (a suspension whose end date has passed can still be cleared); everything else on what applies today.
    const current = action === "LIFT" ? student.standing : effectiveStanding(student.standing, storedUntil, today());
    const next = standingAfter(action, "STUDENT", current) as StandingState | null;
    if (!next) return refuse(409, "NOT_APPLICABLE", `That doesn't apply: this student is ${NOT_APPLICABLE(action)}.`);

    await tx.studentRecord.update({
      where: { tenantId_id: { tenantId, id: studentId } },
      data: { standing: next, standingUntil: next === StandingState.SUSPENDED && until ? asDate(until) : null },
    });
    if (action === "EXPEL") {
      await tx.studentEnrollment.updateMany({
        where: { tenantId, studentId, status: EnrollmentStatus.ACTIVE },
        data: { status: EnrollmentStatus.EXPELLED },
      });
    } else if (action === "REINSTATE") {
      // Back on the roll only in a session that is running; otherwise they are enrolled the normal way.
      await tx.studentEnrollment.updateMany({
        where: { tenantId, studentId, status: EnrollmentStatus.EXPELLED, session: { status: SessionStatus.ACTIVE, archivedAt: null } },
        data: { status: EnrollmentStatus.ACTIVE },
      });
    }
    await writeEvent(
      tx,
      tenantId,
      {
        subject: "STUDENT",
        studentId,
        campusId: student.campusId,
        action,
        reason: input.reason,
        endsOn: until,
        decidedByUserId: actorUserId,
      },
      {
        targetType: "StudentRecord",
        targetId: studentId,
        before: { standing: student.standing, until: storedUntil },
        after: { standing: next, until },
      },
    );
    if (action === "EXPEL") expelledUserId = student.userId;
    return done({ standing: next, until });
  });
  // An expelled pupil is refused at sign-in (task 0028), so a session they already hold ends too, when no other school or role of theirs is left to use it.
  if (expelledUserId && result.ok && (await isExpelledEverywhere(expelledUserId))) await revokeUserSessions(expelledUserId);
  return result;
}

export async function studentStandingHistory(
  tenant: TenantCtx,
  studentId: string,
): Promise<Result<{ standing: string; until: string | null; events: HistoryEntry[] }>> {
  const { tenantId } = tenant;
  const isAdmin = tenant.role === "ADMIN";
  return tenant.run(async (tx) => {
    const student = await tx.studentRecord.findFirst({
      where: { tenantId, id: studentId },
      select: { campusId: true, standing: true, standingUntil: true },
    });
    if (!student || (!isAdmin && (student.campusId === null || student.campusId !== tenant.campusId)))
      return refuse(404, "NOT_FOUND", "That student was not found.");
    const rows = await tx.standingEvent.findMany({
      where: { tenantId, studentId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    const names = await namesOf(
      tx,
      tenantId,
      rows.map((row) => row.decidedByUserId),
    );
    return done({
      standing: student.standing,
      until: student.standingUntil ? dayOf(student.standingUntil) : null,
      events: rows.map((row) => ({
        id: row.id,
        action: row.action,
        reason: row.reason,
        startsOn: dayOf(row.startsOn),
        endsOn: row.endsOn ? dayOf(row.endsOn) : null,
        decidedBy:
          row.decidedByUserId === "system"
            ? "The school's records (the end date passed)"
            : (names.get(row.decidedByUserId) ?? "A person who has left"),
        at: row.createdAt.toISOString(),
      })),
    });
  });
}
