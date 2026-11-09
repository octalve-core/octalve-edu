import { Prisma, ProgramPlaceStatus, ProgramStatus, type AttendanceStatus, type ParticipantKind } from "@prisma/client";
import type { ErrorDetail } from "@/lib/api/envelope";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import type { Tx } from "@/lib/tenant/for-tenant";
import { asDate, namesOf, today } from "@/lib/standing/common";
import { MIN_REASON } from "@/lib/standing/rules";
import { assignedGroupIds, isSupervisor, viewerOf, type ProgramViewer } from "./access";
import {
  BACKDATE_DAYS,
  MAX_SESSIONS_RANGE_DAYS,
  NO_RIGHTS,
  addMark,
  addMarks,
  attendancePercent,
  dayProblem,
  daysBefore,
  emptyCounts,
  isLow,
  mayReadGroup,
  reachOfAccess,
  readsEverything,
  rightsFor,
  rollEntry,
  type Access,
  type Counts,
  type Rights,
} from "./attendance-rules";
import { change, done, refuse, writeAudit, NOT_FOUND, type Result } from "./common";
import { featureStateOf, type FeatureState } from "./feature-switch";
import { groupAndInner, type PlaceState } from "./people-rules";
import { rollPeople, type RollPerson } from "./people-service";
import { groupPath, toIsoDate } from "./rules";
import { attendanceSwitch } from "./settings-service";

// Programs, slice P3: attendance (task 0027; AlEemaan's task 0043, section 10). A session is one group on one day (with a label when there are two a day), opened by the first person who takes
// the roll. Reading never creates anything. Saving a roll goes through the same `change()` guard as every other change (the program's row lock, the school's switch, the audit) and is all or
// nothing. Numbers are computed from the marks every time, never stored.

const GROUP_NOT_FOUND = "That group was not found.";
const PERSON_NOT_FOUND = "That person was not found.";

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Who may do what (the pure rules are in attendance-rules.ts)

export async function accessOf(tx: Tx, tenantId: string, userId: string, programId: string, viewer: ProgramViewer): Promise<Access> {
  if (viewer.level === "SUPER" || viewer.level === "ADMIN") return { markAll: true, supervisor: true, groups: new Set(), campusIds: null };
  // A campus administrator can also be named a teacher or a recorder: the staff places count whatever the viewer's level is.
  const [groups, supervisor] = await Promise.all([
    assignedGroupIds(tx, tenantId, userId, programId),
    isSupervisor(tx, tenantId, userId, programId),
  ]);
  return { markAll: false, supervisor, groups: new Set(groups), campusIds: viewer.level === "CAMPUS" ? [viewer.campusId] : null };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The switch

export type AttendanceStatusView = { on: boolean; offBy: FeatureState["offBy"]; campusesOff: FeatureState["campusesOff"] };

/// Attendance is on for a program only when the school and the program have it on and, when the program runs in chosen campuses, at least one of them does; a campus that has it off simply has no
/// roll (its people are not listed and cannot be marked) while the other campuses go on. What was recorded stays readable whatever the switches say.
export const attendanceStateOf = (tx: Tx, tenantId: string, programId: string, programFlag: boolean): Promise<FeatureState> =>
  featureStateOf(tx, tenantId, attendanceSwitch.stored, programId, programFlag);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Reading a roll

export type RollMark = {
  id: string;
  status: AttendanceStatus;
  remarks: string | null;
  version: number;
  markedBy: string;
  markedAt: string;
  updatedAt: string;
  corrected: boolean;
};
export type RollRow = {
  participantId: string;
  name: string;
  kind: ParticipantKind;
  campusId: string | null;
  groupPath: string;
  /// "SUSPENDED" on today's roll: listed, not markable.
  flag: "SUSPENDED" | null;
  /// Shown only because it has a mark (the person has left or moved on since): read only.
  listed: boolean;
  /// The person's campus has attendance switched off: read only.
  campusOff: boolean;
  /// The caller may write this row now (a mark where there is none, or a change of the one there is).
  canEdit: boolean;
  mark: RollMark | null;
};
export type Roll = {
  group: { id: string; name: string; path: string; archived: boolean };
  date: string;
  label: string;
  today: string;
  sessionId: string | null;
  attendance: AttendanceStatusView;
  programStatus: ProgramStatus;
  rights: Rights;
  /// The earliest day this person may take attendance for (null = any past day).
  earliest: string | null;
  rows: RollRow[];
  counts: Counts;
  marked: number;
};

type GroupNode = { id: string; parentId: string | null; name: string; archivedAt: Date | null };

const markOf = (
  row: {
    id: string;
    status: AttendanceStatus;
    remarks: string | null;
    version: number;
    markedByUserId: string;
    markedAt: Date;
    updatedAt: Date;
  },
  names: Map<string, string>,
): RollMark => ({
  id: row.id,
  status: row.status,
  remarks: row.remarks,
  version: row.version,
  markedBy: names.get(row.markedByUserId) ?? "A person who has left",
  markedAt: row.markedAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  corrected: row.version > 1,
});

const placeOf = (person: RollPerson) => ({
  status: person.status as "ACTIVE" | "WITHDRAWN" | "COMPLETED",
  joinedOn: person.joinedOn,
  endedOn: person.endedOn,
});

const groupNodes = (tx: Tx, tenantId: string, programId: string): Promise<GroupNode[]> =>
  tx.programGroup.findMany({ where: { tenantId, programId }, select: { id: true, parentId: true, name: true, archivedAt: true } });

export async function getRoll(
  auth: TenantAuthContext,
  programId: string,
  query: { groupId: string; date: string; label: string },
): Promise<Result<Roll>> {
  const { tenantId } = auth.tenant;
  return auth.tenant.run(async (tx): Promise<Result<Roll>> => {
    const viewer = await viewerOf(auth, tx, programId);
    if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
    const [access, program, groups] = await Promise.all([
      accessOf(tx, tenantId, auth.userId, programId, viewer),
      tx.program.findFirstOrThrow({ where: { tenantId, id: programId }, select: { attendanceEnabled: true, status: true } }),
      groupNodes(tx, tenantId, programId),
    ]);
    const group = groups.find((candidate) => candidate.id === query.groupId);
    if (!group || !mayReadGroup(access, group.id)) return refuse(404, "NOT_FOUND", GROUP_NOT_FOUND);
    const state = await attendanceStateOf(tx, tenantId, programId, program.attendanceEnabled);
    const todayDay = today();

    const session = await tx.programSession.findUnique({
      where: { programId_groupId_date_label: { programId, groupId: group.id, date: asDate(query.date), label: query.label } },
      select: { id: true },
    });
    const reach = reachOfAccess(access);
    const marks = session
      ? await tx.programAttendance.findMany({ where: { tenantId, sessionId: session.id, AND: [{ participant: { is: reach } }] } })
      : [];
    const names = await namesOf(tx, tenantId, [...new Set(marks.map((mark) => mark.markedByUserId))]);
    const markBy = new Map(marks.map((mark) => [mark.participantId, markOf(mark, names)]));

    const inside = groupAndInner(groups, group.id);
    const people = await rollPeople(tx, { tenantId, programId, AND: [{ groupId: { in: inside } }, reach] }, todayDay);
    // Someone marked in this session who has since moved to another group or left is still shown, read only: a roll is the record of the day.
    const missing = marks.map((mark) => mark.participantId).filter((id) => !people.some((person) => person.id === id));
    const extra = missing.length > 0 ? await rollPeople(tx, { tenantId, programId, AND: [{ id: { in: missing } }, reach] }, todayDay) : [];

    const rights = state.on && program.status === ProgramStatus.ACTIVE ? rightsFor(access, group.id, query.date, todayDay) : NO_RIGHTS;
    const rows: RollRow[] = [];
    let counts = emptyCounts();
    let marked = 0;
    for (const person of [...people, ...extra]) {
      const entry = rollEntry(placeOf(person), person.state as PlaceState, query.date, todayDay);
      const mark = markBy.get(person.id) ?? null;
      if (!entry.listed && !mark) continue;
      const campusOn = state.isOn(person.campusId);
      const listed = entry.listed && people.includes(person);
      rows.push({
        participantId: person.id,
        name: person.name,
        kind: person.kind,
        campusId: person.campusId,
        groupPath: groupPath(groups, person.groupId),
        flag: entry.flag,
        listed,
        campusOff: !campusOn,
        canEdit: listed && entry.markable && campusOn && (mark ? rights.change : rights.create),
        mark,
      });
      if (mark) {
        marked += 1;
        counts = addMark(counts, mark.status);
      }
    }
    return done({
      group: { id: group.id, name: group.name, path: groupPath(groups, group.id), archived: group.archivedAt !== null },
      date: query.date,
      label: query.label,
      today: todayDay,
      sessionId: session?.id ?? null,
      attendance: { on: state.on, offBy: state.offBy, campusesOff: state.campusesOff },
      programStatus: program.status,
      rights,
      earliest: access.markAll ? null : daysBefore(todayDay, BACKDATE_DAYS - 1),
      rows,
      counts,
      marked,
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Saving a roll

export type MarkInput = {
  groupId: string;
  date: string;
  label: string;
  reason?: string;
  marks: { participantId: string; status: AttendanceStatus; remarks?: string | null; version?: number }[];
};
export type MarkResult = { sessionId: string | null; created: number; changed: number; unchanged: number };

type Problem = { status: 400 | 403 | 409; code: string; path: string; message: string };
/// When several kinds of problem are found, the one reported (and listed in full) is the first in this order.
const PRIORITY = ["REASON_REQUIRED", "FORBIDDEN", "NOT_ON_ROLL", "NOT_MARKABLE", "CHANGED"];

/// Saves the roll of one group on one day: every mark or none. Opens the session if this is its first mark. A mark that equals what is stored writes nothing.
export async function markRoll(auth: TenantAuthContext, programId: string, input: MarkInput): Promise<Result<MarkResult>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(auth, programId, "any", async ({ tx, program, viewer }) => {
    const state = await attendanceStateOf(tx, tenantId, program.id, program.attendanceEnabled);
    if (!state.on) return refuse(409, "ATTENDANCE_OFF", "Attendance is switched off for this program.");
    if (program.status !== ProgramStatus.ACTIVE)
      return refuse(409, "PROGRAM_NOT_ACTIVE", "Attendance can be taken only while the program is active.");

    const access = await accessOf(tx, tenantId, actorUserId, programId, viewer);
    const groups = await groupNodes(tx, tenantId, programId);
    const group = groups.find((candidate) => candidate.id === input.groupId);
    if (!group || !mayReadGroup(access, group.id)) return refuse(404, "NOT_FOUND", GROUP_NOT_FOUND);
    if (group.archivedAt) return refuse(409, "GROUP_ARCHIVED", "This group is archived. Restore it to take attendance.");

    const todayDay = today();
    if (input.date > todayDay)
      return refuse(400, "FUTURE_DAY", "Attendance can't be taken for a day that hasn't come.", [
        { path: "body.date", message: "Attendance can't be taken for a day that hasn't come." },
      ]);
    if (program.startsOn && input.date < toIsoDate(program.startsOn)) {
      const message = "The program had not started on that day.";
      return refuse(400, "BEFORE_START", message, [{ path: "body.date", message }]);
    }
    const rights = rightsFor(access, group.id, input.date, todayDay);
    if (!rights.change) {
      // A teacher past their window gets the reason for it; anyone else is simply not allowed here.
      const late = access.groups.has(group.id) ? dayProblem(input.date, todayDay, false) : null;
      return refuse(403, late ? "OUTSIDE_WINDOW" : "FORBIDDEN", late ?? "You can't take attendance for this group.");
    }

    const ids = input.marks.map((mark) => mark.participantId);
    if (new Set(ids).size !== ids.length) {
      const message = "A person is in the list twice.";
      return refuse(400, "DUPLICATE_MARK", message, [{ path: "body.marks", message }]);
    }

    const reach = reachOfAccess(access);
    const people = await rollPeople(
      tx,
      { tenantId, programId, AND: [{ groupId: { in: groupAndInner(groups, group.id) } }, reach] },
      todayDay,
    );
    const byId = new Map(people.map((person) => [person.id, person]));
    const session = await tx.programSession.findUnique({
      where: { programId_groupId_date_label: { programId, groupId: group.id, date: asDate(input.date), label: input.label } },
      select: { id: true },
    });
    const existing = session
      ? await tx.programAttendance.findMany({ where: { tenantId, sessionId: session.id, participantId: { in: ids } } })
      : [];
    const existingBy = new Map(existing.map((row) => [row.participantId, row]));
    const reason = input.reason?.trim() || null;

    const problems: Problem[] = [];
    const toCreate: { person: RollPerson; status: AttendanceStatus; remarks: string | null }[] = [];
    const toChange: { person: RollPerson; row: (typeof existing)[number]; status: AttendanceStatus; remarks: string | null }[] = [];
    let unchanged = 0;
    input.marks.forEach((mark, index) => {
      const path = `body.marks.${index}`;
      const person = byId.get(mark.participantId);
      const entry = person ? rollEntry(placeOf(person), person.state as PlaceState, input.date, todayDay) : null;
      if (!person || !entry || !entry.listed || !state.isOn(person.campusId)) {
        problems.push({ status: 409, code: "NOT_ON_ROLL", path: `${path}.participantId`, message: "This person is not on this roll." });
        return;
      }
      const remarks = mark.remarks?.trim() || null;
      const current = existingBy.get(person.id);
      if (current && current.status === mark.status && (current.remarks ?? null) === remarks) {
        unchanged += 1;
        return;
      }
      if (!entry.markable) {
        problems.push({
          status: 409,
          code: "NOT_MARKABLE",
          path: `${path}.participantId`,
          message: `${person.name} is suspended and can't be marked today.`,
        });
        return;
      }
      if (!current) {
        if (!rights.create) {
          problems.push({ status: 403, code: "FORBIDDEN", path, message: "You can correct a mark that exists, not add a new one." });
          return;
        }
        if (mark.version !== undefined) {
          problems.push({
            status: 409,
            code: "CHANGED",
            path: `${path}.version`,
            message: `${person.name}'s mark has been removed or never existed. Reload the roll.`,
          });
          return;
        }
        toCreate.push({ person, status: mark.status, remarks });
        return;
      }
      if (mark.version !== current.version) {
        problems.push({
          status: 409,
          code: "CHANGED",
          path: `${path}.version`,
          message: `${person.name}'s mark was changed by someone else. Reload the roll.`,
        });
        return;
      }
      if (rights.reasonOnChange && (!reason || reason.length < MIN_REASON)) {
        problems.push({
          status: 400,
          code: "REASON_REQUIRED",
          path: "body.reason",
          message: `Say why the mark is being corrected (at least ${MIN_REASON} characters).`,
        });
        return;
      }
      toChange.push({ person, row: current, status: mark.status, remarks });
    });
    if (problems.length > 0) {
      const first = [...problems].sort((a, b) => PRIORITY.indexOf(a.code) - PRIORITY.indexOf(b.code))[0];
      const same = problems.filter((problem) => problem.code === first.code);
      const details: ErrorDetail[] = same.map((problem) => ({ path: problem.path, message: problem.message }));
      return refuse(first.status, first.code, same.length === 1 ? first.message : `${first.message} (${same.length} people)`, details);
    }

    if (toCreate.length + toChange.length === 0) return done({ sessionId: session?.id ?? null, created: 0, changed: 0, unchanged });

    const opened =
      session ??
      (await tx.programSession.create({
        data: { tenantId, programId, groupId: group.id, date: asDate(input.date), label: input.label, createdByUserId: actorUserId },
        select: { id: true },
      }));
    for (const item of toCreate)
      await tx.programAttendance.create({
        data: {
          tenantId,
          sessionId: opened.id,
          programId,
          participantId: item.person.id,
          campusId: item.person.campusId,
          status: item.status,
          remarks: item.remarks,
          markedByUserId: actorUserId,
        },
      });
    for (const item of toChange) {
      // The version in the condition is the last word: the program's lock already serialises writers, this keeps the guarantee in the statement itself.
      await tx.programAttendance.update({
        where: { id: item.row.id, version: item.row.version },
        // `markedByUserId` stays the person who took the roll; who changed it later, when and why is the correction history's.
        data: { status: item.status, remarks: item.remarks, version: { increment: 1 } },
      });
      await tx.programAttendanceChange.create({
        data: {
          tenantId,
          programId,
          sessionId: opened.id,
          participantId: item.person.id,
          beforeStatus: item.row.status,
          afterStatus: item.status,
          beforeRemarks: item.row.remarks,
          afterRemarks: item.remarks,
          reason,
          changedByUserId: actorUserId,
        },
      });
    }
    await writeAudit(tx, tenantId, {
      programId,
      actorUserId,
      action: toChange.length > 0 ? "ATTENDANCE_CORRECTED" : "ATTENDANCE_TAKEN",
      targetType: "Session",
      targetId: opened.id,
      after: { groupId: group.id, date: input.date, label: input.label, created: toCreate.length, changed: toChange.length, unchanged },
      reason,
    });
    return done({ sessionId: opened.id, created: toCreate.length, changed: toChange.length, unchanged });
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Sessions, the summary, and a person's history

function rangeProblem(from: string, to: string): Result<never> | null {
  if (from > to)
    return refuse(400, "BAD_RANGE", "The first date comes after the last.", [
      { path: "query.from", message: "The first date comes after the last." },
    ]);
  const days = (asDate(to).getTime() - asDate(from).getTime()) / 864e5 + 1;
  if (days > MAX_SESSIONS_RANGE_DAYS)
    return refuse(400, "BAD_RANGE", `Pick at most ${MAX_SESSIONS_RANGE_DAYS} days at a time.`, [
      { path: "query.to", message: `Pick at most ${MAX_SESSIONS_RANGE_DAYS} days at a time.` },
    ]);
  return null;
}

/// The groups of a program a person's numbers may cover: the requested group (and what is inside it) if they may read it, otherwise everything they may read.
function scopeGroups(access: Access, groups: GroupNode[], requested?: string): string[] | null {
  if (requested) {
    if (!groups.some((group) => group.id === requested) || !mayReadGroup(access, requested)) return null;
    return groupAndInner(groups, requested).filter((id) => readsEverything(access) || access.campusIds !== null || access.groups.has(id));
  }
  return groups.map((group) => group.id).filter((id) => mayReadGroup(access, id));
}

export type SessionRow = { id: string; groupId: string; groupPath: string; date: string; label: string; counts: Counts; marked: number };

/// The sessions held in a range (the week at a glance, and the way to open an earlier roll), with how many were marked each way - among the people the viewer may see.
export async function listSessions(
  auth: TenantAuthContext,
  programId: string,
  query: { groupId?: string; from: string; to: string },
): Promise<Result<{ sessions: SessionRow[] }>> {
  const bad = rangeProblem(query.from, query.to);
  if (bad) return bad;
  const { tenantId } = auth.tenant;
  return auth.tenant.run(async (tx): Promise<Result<{ sessions: SessionRow[] }>> => {
    const viewer = await viewerOf(auth, tx, programId);
    if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
    const [access, groups] = await Promise.all([
      accessOf(tx, tenantId, auth.userId, programId, viewer),
      groupNodes(tx, tenantId, programId),
    ]);
    const scope = scopeGroups(access, groups, query.groupId);
    if (scope === null) return refuse(404, "NOT_FOUND", GROUP_NOT_FOUND);
    const sessions = await tx.programSession.findMany({
      where: { tenantId, programId, groupId: { in: scope }, date: { gte: asDate(query.from), lte: asDate(query.to) } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 500,
    });
    const counted = await tx.programAttendance.groupBy({
      by: ["sessionId", "status"],
      where: { tenantId, sessionId: { in: sessions.map((session) => session.id) }, AND: [{ participant: { is: reachOfAccess(access) } }] },
      _count: { _all: true },
    });
    const countsBy = new Map<string, Counts>();
    for (const row of counted)
      countsBy.set(row.sessionId, addMarks(countsBy.get(row.sessionId) ?? emptyCounts(), row.status, row._count._all));
    return done({
      sessions: sessions.map((session) => {
        const counts = countsBy.get(session.id) ?? emptyCounts();
        return {
          id: session.id,
          groupId: session.groupId,
          groupPath: groupPath(groups, session.groupId),
          date: toIsoDate(session.date),
          label: session.label,
          counts,
          marked: counts.present + counts.late + counts.absent + counts.excused,
        };
      }),
    });
  });
}

export type SummaryRow = {
  participantId: string;
  name: string;
  kind: ParticipantKind;
  campusId: string | null;
  groupPath: string;
  held: number;
  counts: Counts;
  percent: number | null;
  low: boolean;
};
export type Summary = {
  from: string;
  to: string;
  threshold: number;
  rows: SummaryRow[];
  totals: Counts & { percent: number | null; held: number };
  truncated: boolean;
};
const SUMMARY_MAX = 2000;

/// Per person over a range: the sessions marked, each way, and the percentage (present and late over present, late and absent; excused sessions left out of both). The people are those with a
/// mark in the range and those whose place in the group is open now; sorted with the lowest percentage first so the ones to look at come first.
export async function summarise(
  auth: TenantAuthContext,
  programId: string,
  query: { groupId?: string; from: string; to: string },
): Promise<Result<Summary>> {
  const bad = rangeProblem(query.from, query.to);
  if (bad) return bad;
  const { tenantId } = auth.tenant;
  return auth.tenant.run(async (tx): Promise<Result<Summary>> => {
    const viewer = await viewerOf(auth, tx, programId);
    if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
    const [access, groups, program] = await Promise.all([
      accessOf(tx, tenantId, auth.userId, programId, viewer),
      groupNodes(tx, tenantId, programId),
      tx.program.findFirstOrThrow({ where: { tenantId, id: programId }, select: { lowAttendancePercent: true } }),
    ]);
    const scope = scopeGroups(access, groups, query.groupId);
    if (scope === null) return refuse(404, "NOT_FOUND", GROUP_NOT_FOUND);
    const reach = reachOfAccess(access);
    const grouped = await tx.programAttendance.groupBy({
      by: ["participantId", "status"],
      where: {
        tenantId,
        programId,
        session: { groupId: { in: scope }, date: { gte: asDate(query.from), lte: asDate(query.to) } },
        AND: [{ participant: { is: reach } }],
      },
      _count: { _all: true },
    });
    const countsBy = new Map<string, Counts>();
    for (const row of grouped)
      countsBy.set(row.participantId, addMarks(countsBy.get(row.participantId) ?? emptyCounts(), row.status, row._count._all));
    const people = await rollPeople(
      tx,
      {
        tenantId,
        programId,
        AND: [reach, { OR: [{ id: { in: [...countsBy.keys()] } }, { status: ProgramPlaceStatus.ACTIVE, groupId: { in: scope } }] }],
      },
      today(),
    );
    const rows: SummaryRow[] = people.map((person) => {
      const counts = countsBy.get(person.id) ?? emptyCounts();
      const percent = attendancePercent(counts);
      return {
        participantId: person.id,
        name: person.name,
        kind: person.kind,
        campusId: person.campusId,
        groupPath: groupPath(groups, person.groupId),
        held: counts.present + counts.late + counts.absent + counts.excused,
        counts,
        percent,
        low: isLow(percent, program.lowAttendancePercent),
      };
    });
    // The ones to look at first: the lowest percentage; no percentage (nothing marked) last.
    rows.sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101) || a.name.localeCompare(b.name));
    const totals = [...countsBy.values()].reduce(
      (sum, counts) => ({
        present: sum.present + counts.present,
        late: sum.late + counts.late,
        absent: sum.absent + counts.absent,
        excused: sum.excused + counts.excused,
      }),
      emptyCounts(),
    );
    return done({
      from: query.from,
      to: query.to,
      threshold: program.lowAttendancePercent,
      rows: rows.slice(0, SUMMARY_MAX),
      totals: { ...totals, held: totals.present + totals.late + totals.absent + totals.excused, percent: attendancePercent(totals) },
      truncated: rows.length > SUMMARY_MAX,
    });
  });
}

export type HistoryMark = {
  id: string;
  date: string;
  label: string;
  groupPath: string;
  status: AttendanceStatus;
  remarks: string | null;
  version: number;
  markedBy: string;
  markedAt: string;
  changes: {
    at: string;
    by: string;
    from: AttendanceStatus;
    to: AttendanceStatus;
    fromRemarks: string | null;
    toRemarks: string | null;
    reason: string | null;
  }[];
};
export type PersonAttendance = {
  person: { id: string; name: string; kind: ParticipantKind; campusId: string | null; groupPath: string };
  from: string | null;
  to: string | null;
  threshold: number;
  counts: Counts;
  percent: number | null;
  low: boolean;
  marks: HistoryMark[];
  truncated: boolean;
};
const HISTORY_MAX = 400;

/// One person's marks, newest first, each with the corrections made to it (who, when, from what, to what, why).
export async function personAttendance(
  auth: TenantAuthContext,
  programId: string,
  personId: string,
  query: { from?: string; to?: string },
): Promise<Result<PersonAttendance>> {
  if (query.from && query.to) {
    const bad = rangeProblem(query.from, query.to);
    if (bad) return bad;
  }
  const { tenantId } = auth.tenant;
  return auth.tenant.run(async (tx): Promise<Result<PersonAttendance>> => {
    const viewer = await viewerOf(auth, tx, programId);
    if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
    const [access, groups, program] = await Promise.all([
      accessOf(tx, tenantId, auth.userId, programId, viewer),
      groupNodes(tx, tenantId, programId),
      tx.program.findFirstOrThrow({ where: { tenantId, id: programId }, select: { lowAttendancePercent: true } }),
    ]);
    const found = await rollPeople(tx, { tenantId, programId, AND: [{ id: personId }, reachOfAccess(access)] }, today());
    const person = found[0];
    if (!person) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
    const sessionWhere: Prisma.ProgramSessionWhereInput = {
      ...(readsEverything(access) || access.campusIds !== null ? {} : { groupId: { in: [...access.groups] } }),
      ...(query.from || query.to
        ? { date: { ...(query.from ? { gte: asDate(query.from) } : {}), ...(query.to ? { lte: asDate(query.to) } : {}) } }
        : {}),
    };
    const rows = await tx.programAttendance.findMany({
      where: { tenantId, programId, participantId: personId, session: sessionWhere },
      include: { session: true },
      orderBy: [{ session: { date: "desc" } }, { session: { createdAt: "desc" } }],
      take: HISTORY_MAX + 1,
    });
    const shown = rows.slice(0, HISTORY_MAX);
    const changes = await tx.programAttendanceChange.findMany({
      where: { tenantId, programId, participantId: personId, sessionId: { in: shown.map((row) => row.sessionId) } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const names = await namesOf(tx, tenantId, [
      ...new Set([...shown.map((row) => row.markedByUserId), ...changes.map((row) => row.changedByUserId)]),
    ]);
    const nameOf = (id: string) => names.get(id) ?? "A person who has left";
    const counts = shown.reduce((sum, row) => addMark(sum, row.status), emptyCounts());
    const percent = attendancePercent(counts);
    return done({
      person: {
        id: person.id,
        name: person.name,
        kind: person.kind,
        campusId: person.campusId,
        groupPath: groupPath(groups, person.groupId),
      },
      from: query.from ?? null,
      to: query.to ?? null,
      threshold: program.lowAttendancePercent,
      counts,
      percent,
      low: isLow(percent, program.lowAttendancePercent),
      marks: shown.map((row) => ({
        id: row.id,
        date: toIsoDate(row.session.date),
        label: row.session.label,
        groupPath: groupPath(groups, row.session.groupId),
        status: row.status,
        remarks: row.remarks,
        version: row.version,
        markedBy: nameOf(row.markedByUserId),
        markedAt: row.markedAt.toISOString(),
        changes: changes
          .filter((item) => item.sessionId === row.sessionId)
          .map((item) => ({
            at: item.createdAt.toISOString(),
            by: nameOf(item.changedByUserId),
            from: item.beforeStatus,
            to: item.afterStatus,
            fromRemarks: item.beforeRemarks,
            toRemarks: item.afterRemarks,
            reason: item.reason,
          })),
      })),
      truncated: rows.length > HISTORY_MAX,
    });
  });
}
