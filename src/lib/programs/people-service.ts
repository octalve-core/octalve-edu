import { Prisma, ParticipantKind, ProgramPlaceStatus, StandingState, StandingSubject, type Gender } from "@prisma/client";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import type { Tx } from "@/lib/tenant/for-tenant";
import { maySuspendSwitch } from "@/lib/standing/settings";
import { asDate, namesOf, today, writeEvent, type HistoryEntry } from "@/lib/standing/common";
import { standingAfter, suspensionEndProblem, type StandingAction } from "@/lib/standing/rules";
import { assignedGroupIds, placeFits, viewerOf, type ProgramViewer } from "./access";
import { change, done, refuse, writeAudit, NOT_FOUND, type Result } from "./common";
import { campusesTakingPart } from "./settings-service";
import { groupPath, toIsoDate } from "./rules";
import {
  MAX_CLASS_ADD,
  MAX_PARTICIPANTS,
  PAGE_SIZE,
  groupAndInner,
  isLinkedKind,
  mayBeSamePerson,
  mayChangeStanding,
  mayManagePerson,
  placeState,
  type PlaceState,
} from "./people-rules";

// Programs, slice P2: the people of a program (task 0027, section 7). Every change goes through the same `change()` guard as the structure (the program's row lock, the school's switch, the
// audit); a person is never hard-deleted (withdrawing ends the place). The state of a place is READ from the school's own records every time.

const PERSON_NOT_FOUND = "That person was not found.";
const GROUP_NOT_FOUND = "That group was not found.";
const CAMPUS_NOT_FOUND = "That campus was not found.";

export const include = {
  student: {
    select: {
      firstName: true,
      lastName: true,
      admissionNo: true,
      dateOfBirth: true,
      archivedAt: true,
      standing: true,
      standingUntil: true,
      campusId: true,
    },
  },
  staffRecord: {
    select: {
      firstName: true,
      lastName: true,
      phone: true,
      userId: true,
      archivedAt: true,
      standing: true,
      standingUntil: true,
      campusId: true,
      membership: { select: { deactivatedAt: true, standing: true, standingUntil: true } },
    },
  },
  guardian: { select: { firstName: true, lastName: true, phone: true, email: true, archivedAt: true } },
} satisfies Prisma.ProgramParticipantInclude;
export type Row = Prisma.ProgramParticipantGetPayload<{ include: typeof include }>;

export const nameOf = (row: Row): string =>
  row.student
    ? `${row.student.firstName} ${row.student.lastName}`
    : row.staffRecord
      ? `${row.staffRecord.firstName} ${row.staffRecord.lastName}`
      : row.guardian
        ? `${row.guardian.firstName} ${row.guardian.lastName}`
        : `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();

export const stateOf = (row: Row, day: string): PlaceState =>
  placeState(
    {
      kind: row.kind,
      status: row.status,
      standing: row.standing,
      standingUntil: row.standingUntil,
      student: row.student,
      staff: row.staffRecord ? { ...row.staffRecord, membership: row.staffRecord.membership ?? null } : null,
      guardian: row.guardian,
    },
    day,
  );

export type Person = {
  id: string;
  kind: ParticipantKind;
  name: string;
  /// A pupil's admission number (so the list can tell two namesakes apart).
  admissionNo: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  campusId: string | null;
  /// "" is "through the school".
  campusName: string;
  groupId: string;
  groupPath: string;
  status: ProgramPlaceStatus;
  state: PlaceState;
  standing: StandingState;
  standingUntil: string | null;
  joinedOn: string;
  endedOn: string | null;
  endedReason: string | null;
  linked: boolean;
  /// What the caller may do about this person's standing (a courtesy for the buttons; the routes check again): only a person typed in has a standing of their own here.
  can: { suspend: boolean; remove: boolean };
};

type Context = {
  groups: { id: string; parentId: string | null; name: string; archivedAt: Date | null }[];
  campuses: Map<string, string>;
  day: string;
  viewer: ProgramViewer;
  actorUserId: string;
  /// Per campus (and "" for the school): may administrators there suspend (the school's switch and the campus's)?
  maySuspend: Map<string, boolean>;
};

async function contextOf(tx: Tx, tenantId: string, viewer: ProgramViewer, actorUserId: string, programId: string): Promise<Context> {
  const [groups, campuses] = await Promise.all([
    tx.programGroup.findMany({ where: { tenantId, programId }, select: { id: true, parentId: true, name: true, archivedAt: true } }),
    tx.campus.findMany({ where: { tenantId }, select: { id: true, name: true } }),
  ]);
  const maySuspend = new Map<string, boolean>();
  for (const campus of [null, ...campuses.map((c) => c.id)])
    maySuspend.set(campus ?? "", await maySuspendSwitch.onFor(tx, tenantId, campus));
  return { groups, campuses: new Map(campuses.map((c) => [c.id, c.name])), day: today(), viewer, actorUserId, maySuspend };
}

function toPerson(row: Row, context: Context): Person {
  const iso = (date: Date | null) => (date ? toIsoDate(date) : null);
  const student = row.student;
  const record = row.staffRecord;
  const guardian = row.guardian;
  const switchOn = context.maySuspend.get(row.campusId ?? "") ?? true;
  return {
    id: row.id,
    kind: row.kind,
    name: nameOf(row),
    admissionNo: student?.admissionNo ?? null,
    dateOfBirth: iso(student?.dateOfBirth ?? row.dateOfBirth),
    phone: record?.phone ?? guardian?.phone ?? row.phone ?? null,
    email: guardian?.email ?? row.email,
    guardianName: row.guardianName,
    guardianPhone: row.guardianPhone,
    campusId: row.campusId,
    campusName: row.campusId ? (context.campuses.get(row.campusId) ?? "") : "",
    groupId: row.groupId,
    groupPath: groupPath(context.groups, row.groupId),
    status: row.status,
    state: stateOf(row, context.day),
    standing: row.standing,
    standingUntil: iso(row.standingUntil),
    joinedOn: toIsoDate(row.joinedOn),
    endedOn: iso(row.endedOn),
    endedReason: row.endedReason,
    linked: isLinkedKind(row.kind),
    can: {
      suspend:
        !isLinkedKind(row.kind) && mayChangeStanding(context.viewer, "SUSPEND", row.campusId, switchOn, context.actorUserId) === null,
      remove: !isLinkedKind(row.kind) && mayChangeStanding(context.viewer, "EXPEL", row.campusId, switchOn, context.actorUserId) === null,
    },
  };
}

/// What a viewer can reach: everyone for the school's administrator and a program admin, and for a campus administrator only the people through their own campus (never the people through
/// the school). ALWAYS combined with the other conditions by AND (never spread next to them: a filter on the same key would replace it and show someone else's people).
export async function reachOf(
  tx: Tx,
  tenantId: string,
  programId: string,
  viewer: ProgramViewer,
): Promise<Prisma.ProgramParticipantWhereInput> {
  if (viewer.level === "CAMPUS") return { campusId: viewer.campusId };
  // A teacher or a recorder sees the people in the groups they are assigned to (and the groups inside them); a supervisor sees everyone.
  if (viewer.level === "STAFF" && !viewer.supervisor)
    return { groupId: { in: await assignedGroupIds(tx, tenantId, viewer.userId, programId) } };
  return {};
}

/// What attendance needs to know about a place on a given day (slice P3): who, where, and the state of the place read from the school's own records NOW (the roll ignores it for a past day).
export type RollPerson = {
  id: string;
  name: string;
  kind: ParticipantKind;
  campusId: string | null;
  groupId: string;
  status: ProgramPlaceStatus;
  joinedOn: Date;
  endedOn: Date | null;
  state: PlaceState;
};

/// The places matching `where` for a roll or a report, name-sorted. `where` already carries the tenant, the program and whatever the viewer may reach; at most MAX_PARTICIPANTS rows.
export async function rollPeople(tx: Tx, where: Prisma.ProgramParticipantWhereInput, day: string): Promise<RollPerson[]> {
  const rows = await tx.programParticipant.findMany({ where, include, take: MAX_PARTICIPANTS });
  return rows
    .map((row) => ({
      id: row.id,
      name: nameOf(row),
      kind: row.kind,
      campusId: row.campusId,
      groupId: row.groupId,
      status: row.status,
      joinedOn: row.joinedOn,
      endedOn: row.endedOn,
      state: stateOf(row, day),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/// What billing needs of a place (slice P4): who, where, the state now, and the contact details on the record (a pupil's guardian, a member of staff's or a typed-in person's phone).
export type BillingPerson = RollPerson & { ownPhone: string | null; guardianName: string | null; guardianPhone: string | null };

export async function billingPeople(tx: Tx, where: Prisma.ProgramParticipantWhereInput, day: string): Promise<BillingPerson[]> {
  const rows = await tx.programParticipant.findMany({
    where,
    include: {
      ...include,
      student: {
        select: {
          ...include.student.select,
          guardians: {
            where: { status: "APPROVED", revokedAt: null },
            select: { isPrimary: true, guardian: { select: { firstName: true, lastName: true, phone: true } } },
            orderBy: { isPrimary: "desc" },
            take: 1,
          },
        },
      },
    },
    take: MAX_PARTICIPANTS,
  });
  return rows
    .map((row) => {
      const link = row.student?.guardians[0]?.guardian;
      return {
        id: row.id,
        name: nameOf(row),
        kind: row.kind,
        campusId: row.campusId,
        groupId: row.groupId,
        status: row.status,
        joinedOn: row.joinedOn,
        endedOn: row.endedOn,
        state: stateOf(row, day),
        ownPhone: row.staffRecord?.phone ?? row.guardian?.phone ?? row.phone ?? null,
        guardianName: link ? `${link.firstName} ${link.lastName}` : (row.guardianName ?? null),
        guardianPhone: link?.phone ?? row.guardianPhone ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/// A search text as text: `%` and `_` are not wildcards here (Prisma does not escape them for `contains`).
const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Reading

export type ListQuery = { q?: string; groupId?: string; campusId?: string; kind?: ParticipantKind; state?: PlaceState; page: number };
export type PeoplePage = { people: Person[]; total: number; page: number; pageSize: number; hasNext: boolean };

/// The people of a program the viewer may see, newest joiners first (a name sort across a pupil's record, a staff record and a typed-in person cannot be paged in the database; the search
/// box finds a name). A `state` filter is read from the school's records, so it is applied after the rows are loaded (never more than MAX_PARTICIPANTS of them).
export async function listPeople(auth: TenantAuthContext, programId: string, query: ListQuery): Promise<Result<PeoplePage>> {
  const { tenantId } = auth.tenant;
  return auth.tenant.run(async (tx): Promise<Result<PeoplePage>> => {
    const viewer = await viewerOf(auth, tx, programId);
    if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
    const context = await contextOf(tx, tenantId, viewer, auth.userId, programId);
    const groupIds = query.groupId ? groupAndInner(context.groups, query.groupId) : null;
    const q = query.q?.trim();
    const like = q ? { contains: escapeLike(q), mode: "insensitive" as const } : null;
    const where: Prisma.ProgramParticipantWhereInput = {
      tenantId,
      programId,
      AND: [
        await reachOf(tx, tenantId, programId, viewer),
        ...(groupIds ? [{ groupId: { in: groupIds } }] : []),
        ...(query.campusId ? [{ campusId: query.campusId }] : []),
        ...(query.kind ? [{ kind: query.kind }] : []),
        ...(like
          ? [
              {
                OR: [
                  { firstName: like },
                  { lastName: like },
                  { student: { OR: [{ firstName: like }, { lastName: like }, { admissionNo: like }] } },
                  { staffRecord: { OR: [{ firstName: like }, { lastName: like }] } },
                  { guardian: { OR: [{ firstName: like }, { lastName: like }] } },
                ],
              },
            ]
          : []),
      ],
    };
    const orderBy: Prisma.ProgramParticipantOrderByWithRelationInput[] = [{ joinedOn: "desc" }, { id: "asc" }];
    const skip = (query.page - 1) * PAGE_SIZE;
    if (query.state) {
      const rows = await tx.programParticipant.findMany({ where, include, orderBy, take: MAX_PARTICIPANTS });
      const matching = rows.filter((row) => stateOf(row, context.day) === query.state);
      const people = matching.slice(skip, skip + PAGE_SIZE).map((row) => toPerson(row, context));
      return done({ people, total: matching.length, page: query.page, pageSize: PAGE_SIZE, hasNext: skip + PAGE_SIZE < matching.length });
    }
    const [rows, total] = await Promise.all([
      tx.programParticipant.findMany({ where, include, orderBy, skip, take: PAGE_SIZE }),
      tx.programParticipant.count({ where }),
    ]);
    return done({
      people: rows.map((row) => toPerson(row, context)),
      total,
      page: query.page,
      pageSize: PAGE_SIZE,
      hasNext: skip + PAGE_SIZE < total,
    });
  });
}

/// How many people are in each group (the group and everything inside it): only the places that are still open, and only the people the viewer may see. Used by the program's page (the
/// Structure tab shows the head count of each group).
export async function peopleByGroup(
  tx: Tx,
  tenantId: string,
  viewer: ProgramViewer,
  programId: string,
  groups: { id: string; parentId: string | null; name: string }[],
): Promise<Record<string, number>> {
  const rows = await tx.programParticipant.groupBy({
    by: ["groupId"],
    where: { tenantId, programId, status: ProgramPlaceStatus.ACTIVE, AND: [await reachOf(tx, tenantId, programId, viewer)] },
    _count: { _all: true },
  });
  const own = new Map(rows.map((row) => [row.groupId, row._count._all]));
  const counts: Record<string, number> = {};
  for (const group of groups) counts[group.id] = groupAndInner(groups, group.id).reduce((sum, id) => sum + (own.get(id) ?? 0), 0);
  return counts;
}

export type HistoryRow = { id: string; action: string; at: string; by: string; reason: string | null; detail: unknown };

export async function getPerson(
  auth: TenantAuthContext,
  programId: string,
  personId: string,
): Promise<Result<{ person: Person; history: HistoryRow[] }>> {
  const { tenantId } = auth.tenant;
  return auth.tenant.run(async (tx): Promise<Result<{ person: Person; history: HistoryRow[] }>> => {
    const viewer = await viewerOf(auth, tx, programId);
    if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
    const row = await tx.programParticipant.findFirst({
      where: { tenantId, id: personId, programId, AND: [await reachOf(tx, tenantId, programId, viewer)] },
      include,
    });
    if (!row) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
    const context = await contextOf(tx, tenantId, viewer, auth.userId, programId);
    const rows = await tx.programAudit.findMany({
      where: { tenantId, programId, targetType: "Participant", targetId: personId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    const names = await namesOf(
      tx,
      tenantId,
      rows.map((r) => r.actorUserId),
    );
    return done({
      person: toPerson(row, context),
      history: rows.map((r) => ({
        id: r.id,
        action: r.action,
        at: r.createdAt.toISOString(),
        by: names.get(r.actorUserId) ?? "Someone",
        reason: r.reason,
        detail: r.afterValue,
      })),
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Adding

export type Candidate = { id: string; name: string; detail: string; campusId: string | null; campusName: string; note: string | null };

/// The campuses a program runs in that the viewer can reach, plus the school itself (null) for a viewer who handles the people through the school.
async function reachableCampuses(tx: Tx, tenantId: string, programId: string, viewer: ProgramViewer) {
  const linked = (await tx.programCampus.findMany({ where: { tenantId, programId }, select: { campusId: true } })).map((r) => r.campusId);
  const campuses = await tx.campus.findMany({
    where: { tenantId, ...(linked.length > 0 ? { id: { in: linked } } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { linked, campuses: campuses.filter((campus) => mayManagePerson(viewer, campus.id)), school: mayManagePerson(viewer, null) };
}

/// Pupils, members of staff or guardians the viewer may add: live records whose campus the viewer may manage (a school-level record only for the administrator and a program admin),
/// found by name or admission number, with the note that says why one cannot be added. At most 25 at a time.
export async function candidates(
  auth: TenantAuthContext,
  programId: string,
  query: { kind: "STUDENT" | "STAFF" | "GUARDIAN"; q: string },
): Promise<Result<Candidate[]>> {
  const { tenantId } = auth.tenant;
  return auth.tenant.run(async (tx): Promise<Result<Candidate[]>> => {
    const viewer = await viewerOf(auth, tx, programId);
    if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
    const { linked, campuses, school } = await reachableCampuses(tx, tenantId, programId, viewer);
    const names = new Map(campuses.map((campus) => [campus.id, campus.name]));
    const q = query.q.trim();
    if ((campuses.length === 0 && !school) || q.length < 2) return done([]);
    // A school-wide program takes a record of any campus; a program with campuses takes the school-level records and those campuses'.
    const campusWhere: ({ campusId: null } | { campusId: { in: string[] } } | { campusId: { not: null } })[] = [
      ...(school ? [{ campusId: null }] : []),
      { campusId: { in: campuses.map((campus) => campus.id) } },
      ...(linked.length === 0 && school ? [{ campusId: { not: null as null } }] : []),
    ];
    const present = await tx.programParticipant.findMany({
      where: { tenantId, programId, kind: query.kind },
      select: { studentId: true, staffRecordId: true, guardianId: true, status: true },
    });
    const taken = new Map(present.map((row) => [row.studentId ?? row.staffRecordId ?? row.guardianId, row.status]));
    const noteFor = (id: string): string | null =>
      taken.has(id)
        ? taken.get(id) === ProgramPlaceStatus.ACTIVE
          ? "Already in this program"
          : "Has left this program: re-enrol them"
        : null;
    const like = { contains: escapeLike(q), mode: "insensitive" as const };
    if (query.kind === "STUDENT") {
      const students = await tx.studentRecord.findMany({
        where: {
          tenantId,
          archivedAt: null,
          AND: [{ OR: campusWhere }, { OR: [{ firstName: like }, { lastName: like }, { admissionNo: like }] }],
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: 25,
        select: { id: true, firstName: true, lastName: true, admissionNo: true, campusId: true, standing: true },
      });
      return done(
        students.map((s) => ({
          id: s.id,
          name: `${s.firstName} ${s.lastName}`,
          detail: s.admissionNo,
          campusId: s.campusId,
          campusName: s.campusId ? (names.get(s.campusId) ?? "") : "",
          note: noteFor(s.id) ?? (s.standing === "EXPELLED" ? "Expelled" : null),
        })),
      );
    }
    if (query.kind === "STAFF") {
      const staff = await tx.staffRecord.findMany({
        where: { tenantId, archivedAt: null, AND: [{ OR: campusWhere }, { OR: [{ firstName: like }, { lastName: like }] }] },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: 25,
        select: { id: true, firstName: true, lastName: true, designation: true, campusId: true },
      });
      return done(
        staff.map((s) => ({
          id: s.id,
          name: `${s.firstName} ${s.lastName}`,
          detail: s.designation ?? "Staff",
          campusId: s.campusId,
          campusName: s.campusId ? (names.get(s.campusId) ?? "") : "",
          note: noteFor(s.id),
        })),
      );
    }
    // A guardian has no campus of their own: they are added through the school (or, for a campus administrator, through their campus).
    const guardians = await tx.guardianRecord.findMany({
      where: { tenantId, archivedAt: null, OR: [{ firstName: like }, { lastName: like }, { phone: like }] },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 25,
      select: { id: true, firstName: true, lastName: true, phone: true },
    });
    const through = viewer.level === "CAMPUS" ? viewer.campusId : null;
    return done(
      guardians.map((g) => ({
        id: g.id,
        name: `${g.firstName} ${g.lastName}`,
        detail: g.phone ?? "Guardian",
        campusId: through,
        campusName: through ? (names.get(through) ?? "") : "",
        note: noteFor(g.id),
      })),
    );
  });
}

export type ClassOption = { id: string; label: string; campusId: string | null; campusName: string; pupils: number };

/// The school's classes the caller may add from: the live class arms whose campus the caller may manage (a school-level class only for the administrator and a program admin), with how many
/// pupils are in each now.
export async function classOptions(auth: TenantAuthContext, programId: string): Promise<Result<ClassOption[]>> {
  const { tenantId } = auth.tenant;
  return auth.tenant.run(async (tx): Promise<Result<ClassOption[]>> => {
    const viewer = await viewerOf(auth, tx, programId);
    if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
    const { linked, campuses, school } = await reachableCampuses(tx, tenantId, programId, viewer);
    if (campuses.length === 0 && !school) return done([]);
    const names = new Map(campuses.map((campus) => [campus.id, campus.name]));
    const arms = await tx.classArm.findMany({
      where: {
        tenantId,
        archivedAt: null,
        classGroup: {
          OR: [
            ...(school ? [{ campusId: null }] : []),
            { campusId: { in: campuses.map((campus) => campus.id) } },
            ...(linked.length === 0 && school ? [{ campusId: { not: null } }] : []),
          ],
        },
      },
      orderBy: [{ classGroup: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        classGroup: { select: { name: true, campusId: true } },
        _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
      },
    });
    return done(
      arms.map((arm) => ({
        id: arm.id,
        label: `${arm.classGroup.name} ${arm.name}`,
        campusId: arm.classGroup.campusId,
        campusName: arm.classGroup.campusId ? (names.get(arm.classGroup.campusId) ?? "") : "",
        pupils: arm._count.enrollments,
      })),
    );
  });
}

export type StandaloneInput = {
  kind: "ADULT" | "CHILD";
  firstName: string;
  lastName: string;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  campusId?: string | null;
};
export type AddInput =
  | { kind: "STUDENT"; studentId: string; groupId: string }
  | { kind: "STAFF"; staffRecordId: string; groupId: string }
  | { kind: "GUARDIAN"; guardianId: string; groupId: string }
  | ({ groupId: string; confirmNamesake?: boolean } & StandaloneInput);

async function liveGroup(tx: Tx, tenantId: string, programId: string, groupId: string) {
  return tx.programGroup.findFirst({ where: { tenantId, id: groupId, programId, archivedAt: null }, select: { id: true } });
}

async function checkRoom(tx: Tx, tenantId: string, programId: string, adding: number): Promise<boolean> {
  return (await tx.programParticipant.count({ where: { tenantId, programId } })) + adding <= MAX_PARTICIPANTS;
}

/// Is the person (through `campusId`) allowed into this program by this viewer? A campus the program does not run in (when it runs in chosen ones), and a campus or the school that the
/// viewer does not manage, are the same answer (404); a campus that has switched programs off is a 409.
async function campusAllowed(
  tx: Tx,
  tenantId: string,
  programId: string,
  campusId: string | null,
  viewer: ProgramViewer,
): Promise<Result<true>> {
  const linked = (await tx.programCampus.findMany({ where: { tenantId, programId }, select: { campusId: true } })).map((r) => r.campusId);
  if (!placeFits(linked, campusId) || !mayManagePerson(viewer, campusId)) return refuse(404, "NOT_FOUND", CAMPUS_NOT_FOUND);
  if (campusId && (await campusesTakingPart(tx, tenantId, [campusId])).get(campusId) === false)
    return refuse(409, "CAMPUS_PROGRAMS_OFF", "That campus has switched programs off.");
  return done(true);
}

const alreadyIn = (status: ProgramPlaceStatus) =>
  refuse(
    409,
    status === "ACTIVE" ? "ALREADY_IN" : "LEFT_ALREADY",
    status === "ACTIVE" ? "They are already in this program." : "They have left this program. Re-enrol them instead.",
  );

/// Adds one person: a pupil, a member of staff or a guardian by LINKING their record (the campus is the record's), or a person typed in (adult, child) through a campus the program runs in.
/// One place per person: a person already in the program is refused, and one who has left is told to be re-enrolled. A namesake of a typed-in person is refused unless the administrator
/// confirms, and the confirmation is audited.
export async function addPerson(auth: TenantAuthContext, programId: string, input: AddInput): Promise<Result<{ id: string }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(auth, programId, "people", async ({ tx, program, viewer }) => {
    if (!(await liveGroup(tx, tenantId, program.id, input.groupId))) return refuse(404, "NOT_FOUND", GROUP_NOT_FOUND);
    if (!(await checkRoom(tx, tenantId, program.id, 1)))
      return refuse(409, "TOO_MANY", `A program can have at most ${MAX_PARTICIPANTS} people.`);
    const base = { tenantId, programId: program.id, groupId: input.groupId, joinedOn: asDate(today()), createdByUserId: actorUserId };
    let data: Prisma.ProgramParticipantUncheckedCreateInput;
    let label: string;
    let namesakeConfirmed = false;

    if (input.kind === "STUDENT") {
      const student = await tx.studentRecord.findFirst({
        where: { tenantId, id: input.studentId },
        select: { id: true, campusId: true, firstName: true, lastName: true, archivedAt: true },
      });
      if (!student || student.archivedAt) return refuse(404, "NOT_FOUND", "That student was not found.");
      const allowed = await campusAllowed(tx, tenantId, program.id, student.campusId, viewer);
      if (!allowed.ok) return allowed;
      const existing = await tx.programParticipant.findFirst({
        where: { programId: program.id, studentId: student.id },
        select: { status: true },
      });
      if (existing) return alreadyIn(existing.status);
      data = { ...base, kind: ParticipantKind.STUDENT, studentId: student.id, campusId: student.campusId };
      label = `${student.firstName} ${student.lastName}`;
    } else if (input.kind === "STAFF") {
      const record = await tx.staffRecord.findFirst({
        where: { tenantId, id: input.staffRecordId },
        select: { id: true, campusId: true, firstName: true, lastName: true, archivedAt: true },
      });
      if (!record || record.archivedAt) return refuse(404, "NOT_FOUND", "That member of staff was not found.");
      const allowed = await campusAllowed(tx, tenantId, program.id, record.campusId, viewer);
      if (!allowed.ok) return allowed;
      const existing = await tx.programParticipant.findFirst({
        where: { programId: program.id, staffRecordId: record.id },
        select: { status: true },
      });
      if (existing) return alreadyIn(existing.status);
      data = { ...base, kind: ParticipantKind.STAFF, staffRecordId: record.id, campusId: record.campusId };
      label = `${record.firstName} ${record.lastName}`;
    } else if (input.kind === "GUARDIAN") {
      const guardian = await tx.guardianRecord.findFirst({
        where: { tenantId, id: input.guardianId },
        select: { id: true, firstName: true, lastName: true, archivedAt: true },
      });
      if (!guardian || guardian.archivedAt) return refuse(404, "NOT_FOUND", "That guardian was not found.");
      // A guardian has no campus of their own: a campus administrator adds them through their campus, the others through the school.
      const through = viewer.level === "CAMPUS" ? viewer.campusId : null;
      const allowed = await campusAllowed(tx, tenantId, program.id, through, viewer);
      if (!allowed.ok) return allowed;
      const existing = await tx.programParticipant.findFirst({
        where: { programId: program.id, guardianId: guardian.id },
        select: { status: true },
      });
      if (existing) return alreadyIn(existing.status);
      data = { ...base, kind: ParticipantKind.GUARDIAN, guardianId: guardian.id, campusId: through };
      label = `${guardian.firstName} ${guardian.lastName}`;
    } else {
      const through = input.campusId ?? (viewer.level === "CAMPUS" ? viewer.campusId : null);
      const allowed = await campusAllowed(tx, tenantId, program.id, through, viewer);
      if (!allowed.ok) return allowed;
      const others = await tx.programParticipant.findMany({
        where: {
          tenantId,
          programId: program.id,
          kind: { in: [ParticipantKind.ADULT, ParticipantKind.CHILD] },
          status: { not: ProgramPlaceStatus.WITHDRAWN },
        },
        select: { firstName: true, lastName: true, dateOfBirth: true, phone: true, guardianPhone: true },
      });
      const me = {
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth ?? null,
        phone: input.phone ?? input.guardianPhone ?? null,
      };
      const twin = others.find((other) =>
        mayBeSamePerson(me, {
          firstName: other.firstName ?? "",
          lastName: other.lastName ?? "",
          dateOfBirth: other.dateOfBirth ? toIsoDate(other.dateOfBirth) : null,
          phone: other.phone ?? other.guardianPhone,
        }),
      );
      if (twin && !input.confirmNamesake) {
        return refuse(
          409,
          "POSSIBLE_DUPLICATE",
          `Someone called ${twin.firstName} ${twin.lastName} with the same birth date or phone number is already in this program. Confirm if this is a different person.`,
          [{ path: "body.confirmNamesake", message: "Confirm that this is a different person." }],
        );
      }
      namesakeConfirmed = Boolean(twin);
      data = {
        ...base,
        kind: input.kind,
        campusId: through,
        firstName: input.firstName,
        lastName: input.lastName,
        gender: input.gender ?? null,
        dateOfBirth: input.dateOfBirth ? asDate(input.dateOfBirth) : null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        guardianName: input.guardianName ?? null,
        guardianPhone: input.guardianPhone ?? null,
      };
      label = `${input.firstName} ${input.lastName}`;
    }
    const created = await tx.programParticipant.create({ data, select: { id: true } });
    await writeAudit(tx, tenantId, {
      programId: program.id,
      actorUserId,
      action: "PERSON_ADDED",
      targetType: "Participant",
      targetId: created.id,
      after: { name: label, kind: data.kind, groupId: input.groupId, campusId: data.campusId ?? null, namesakeConfirmed },
    });
    return done({ id: created.id });
  });
}

export type ClassPlan = {
  arm: { id: string; name: string; className: string; campusId: string | null };
  willAdd: { studentId: string; name: string; note: string | null }[];
  skipped: { name: string; reason: "ALREADY_IN" | "LEFT_ALREADY" | "ARCHIVED" | "EXPELLED" | "OTHER_CAMPUS" }[];
};

/// A whole class of pupils at once. Without `confirm` it only SAYS who would be added and who would be skipped (already in, has left, archived, expelled, or from a campus the caller
/// does not manage or the program does not run in); with it, one audited step adds them all or none.
export async function addClass(
  auth: TenantAuthContext,
  programId: string,
  input: { classArmId: string; groupId: string; confirm: boolean },
): Promise<Result<ClassPlan & { added: number }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(auth, programId, "people", async ({ tx, program, viewer }) => {
    if (!(await liveGroup(tx, tenantId, program.id, input.groupId))) return refuse(404, "NOT_FOUND", GROUP_NOT_FOUND);
    const arm = await tx.classArm.findFirst({
      where: { tenantId, id: input.classArmId },
      select: { id: true, name: true, archivedAt: true, classGroup: { select: { name: true, campusId: true } } },
    });
    if (!arm || arm.archivedAt) return refuse(404, "NOT_FOUND", "That class was not found.");
    const armCampus = arm.classGroup.campusId;
    const allowed = await campusAllowed(tx, tenantId, program.id, armCampus, viewer);
    if (!allowed.ok) return allowed;
    const enrolments = await tx.studentEnrollment.findMany({
      where: { tenantId, classArmId: arm.id, status: "ACTIVE" },
      select: { student: { select: { id: true, firstName: true, lastName: true, archivedAt: true, standing: true, campusId: true } } },
    });
    if (enrolments.length > MAX_CLASS_ADD)
      return refuse(409, "TOO_MANY", `A class of more than ${MAX_CLASS_ADD} pupils can't be added in one step.`);
    const existing = new Map(
      (
        await tx.programParticipant.findMany({
          where: { tenantId, programId: program.id, studentId: { in: enrolments.map((e) => e.student.id) } },
          select: { studentId: true, status: true },
        })
      ).map((row) => [row.studentId, row.status]),
    );
    const linked = (await tx.programCampus.findMany({ where: { tenantId, programId: program.id }, select: { campusId: true } })).map(
      (r) => r.campusId,
    );
    const plan: ClassPlan = {
      arm: { id: arm.id, name: arm.name, className: arm.classGroup.name, campusId: armCampus },
      willAdd: [],
      skipped: [],
    };
    const campusOf = new Map<string, string | null>();
    for (const { student } of enrolments) {
      const name = `${student.firstName} ${student.lastName}`;
      const was = existing.get(student.id);
      if (was) plan.skipped.push({ name, reason: was === "ACTIVE" ? "ALREADY_IN" : "LEFT_ALREADY" });
      else if (student.archivedAt) plan.skipped.push({ name, reason: "ARCHIVED" });
      else if (student.standing === "EXPELLED") plan.skipped.push({ name, reason: "EXPELLED" });
      else if (!placeFits(linked, student.campusId) || !mayManagePerson(viewer, student.campusId))
        plan.skipped.push({ name, reason: "OTHER_CAMPUS" });
      else {
        plan.willAdd.push({ studentId: student.id, name, note: student.standing === "SUSPENDED" ? "Suspended" : null });
        campusOf.set(student.id, student.campusId);
      }
    }
    if (!input.confirm) return done({ ...plan, added: 0 });
    if (!(await checkRoom(tx, tenantId, program.id, plan.willAdd.length)))
      return refuse(409, "TOO_MANY", `A program can have at most ${MAX_PARTICIPANTS} people.`);
    if (plan.willAdd.length > 0) {
      await tx.programParticipant.createMany({
        data: plan.willAdd.map((entry) => ({
          tenantId,
          programId: program.id,
          kind: ParticipantKind.STUDENT,
          studentId: entry.studentId,
          campusId: campusOf.get(entry.studentId) ?? null,
          groupId: input.groupId,
          joinedOn: asDate(today()),
          createdByUserId: actorUserId,
        })),
      });
    }
    await writeAudit(tx, tenantId, {
      programId: program.id,
      actorUserId,
      action: "CLASS_ADDED",
      targetType: "Program",
      targetId: program.id,
      after: {
        arm: `${arm.classGroup.name} ${arm.name}`,
        groupId: input.groupId,
        added: plan.willAdd.length,
        skipped: plan.skipped.length,
      },
    });
    return done({ ...plan, added: plan.willAdd.length });
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Changing a person

async function placeOf(tx: Tx, tenantId: string, programId: string, personId: string, viewer: ProgramViewer) {
  return tx.programParticipant.findFirst({
    where: { tenantId, id: personId, programId, AND: [await reachOf(tx, tenantId, programId, viewer)] },
    include,
  });
}

export type EditInput = {
  firstName?: string;
  lastName?: string;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
};

/// Edits the details of a person who was typed in. A linked person's details are the school's record and are changed there.
export async function editPerson(
  auth: TenantAuthContext,
  programId: string,
  personId: string,
  input: EditInput,
): Promise<Result<{ id: string }>> {
  const { tenantId } = auth.tenant;
  return change(auth, programId, "people", async ({ tx, program, viewer }) => {
    const row = await placeOf(tx, tenantId, program.id, personId, viewer);
    if (!row) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
    if (isLinkedKind(row.kind)) return refuse(409, "LINKED", "This person's details are the school's record. Change them there.");
    const next = {
      firstName: input.firstName ?? row.firstName,
      lastName: input.lastName ?? row.lastName,
      gender: input.gender === undefined ? row.gender : input.gender,
      dateOfBirth: input.dateOfBirth === undefined ? row.dateOfBirth : input.dateOfBirth ? asDate(input.dateOfBirth) : null,
      phone: input.phone === undefined ? row.phone : input.phone,
      email: input.email === undefined ? row.email : input.email,
      guardianName: input.guardianName === undefined ? row.guardianName : input.guardianName,
      guardianPhone: input.guardianPhone === undefined ? row.guardianPhone : input.guardianPhone,
    };
    if (row.kind === "CHILD" && (!next.dateOfBirth || !next.guardianName?.trim() || !next.guardianPhone?.trim()))
      return refuse(400, "VALIDATION", "A child needs a date of birth, a guardian's name and a guardian's phone.", [
        { path: "body", message: "A child needs a date of birth, a guardian's name and a guardian's phone." },
      ]);
    await tx.programParticipant.update({ where: { tenantId_id: { tenantId, id: row.id } }, data: next });
    await writeAudit(tx, tenantId, {
      programId: program.id,
      actorUserId: auth.userId,
      action: "PERSON_EDITED",
      targetType: "Participant",
      targetId: row.id,
      before: { name: nameOf(row) },
      after: { name: `${next.firstName} ${next.lastName}`, fields: Object.keys(input) },
    });
    return done({ id: row.id });
  });
}

/// Moves a person to another live group of the same program. Their campus does not change.
export async function movePerson(
  auth: TenantAuthContext,
  programId: string,
  personId: string,
  groupId: string,
): Promise<Result<{ id: string }>> {
  const { tenantId } = auth.tenant;
  return change(auth, programId, "people", async ({ tx, program, viewer }) => {
    const row = await placeOf(tx, tenantId, program.id, personId, viewer);
    if (!row) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
    if (row.status !== ProgramPlaceStatus.ACTIVE)
      return refuse(409, "NOT_ACTIVE", "Only a place that is still open can be moved. Re-enrol them first.");
    if (row.groupId === groupId) return done({ id: row.id });
    if (!(await liveGroup(tx, tenantId, program.id, groupId))) return refuse(404, "NOT_FOUND", GROUP_NOT_FOUND);
    await tx.programParticipant.update({ where: { tenantId_id: { tenantId, id: row.id } }, data: { groupId } });
    await writeAudit(tx, tenantId, {
      programId: program.id,
      actorUserId: auth.userId,
      action: "PERSON_MOVED",
      targetType: "Participant",
      targetId: row.id,
      before: { groupId: row.groupId },
      after: { name: nameOf(row), groupId },
    });
    return done({ id: row.id });
  });
}

/// Withdraws a person (their place ends today; nothing is deleted) or re-enrols one who left (into the group they were in, or another live one).
export async function setPlace(
  auth: TenantAuthContext,
  programId: string,
  personId: string,
  input: { action: "WITHDRAW" | "REENROL"; reason: string; groupId?: string },
): Promise<Result<{ id: string; status: ProgramPlaceStatus }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change<{ id: string; status: ProgramPlaceStatus }>(auth, programId, "people", async ({ tx, program, viewer }) => {
    const row = await placeOf(tx, tenantId, program.id, personId, viewer);
    if (!row) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
    if (input.action === "WITHDRAW") {
      if (row.status !== ProgramPlaceStatus.ACTIVE) return refuse(409, "NOT_APPLICABLE", "That doesn't apply: their place is not open.");
      await tx.programParticipant.update({
        where: { tenantId_id: { tenantId, id: row.id } },
        data: { status: ProgramPlaceStatus.WITHDRAWN, endedOn: asDate(today()), endedReason: input.reason },
      });
      await writeAudit(tx, tenantId, {
        programId: program.id,
        actorUserId,
        action: "PERSON_WITHDRAWN",
        targetType: "Participant",
        targetId: row.id,
        before: { status: row.status },
        after: { name: nameOf(row) },
        reason: input.reason,
      });
      return done({ id: row.id, status: ProgramPlaceStatus.WITHDRAWN });
    }
    if (row.status !== ProgramPlaceStatus.WITHDRAWN) return refuse(409, "NOT_APPLICABLE", "That doesn't apply: they have not left.");
    const groupId = input.groupId ?? row.groupId;
    if (!(await liveGroup(tx, tenantId, program.id, groupId)))
      return refuse(409, "GROUP_ARCHIVED", "Their group is archived. Choose a group to put them in.", [
        { path: "body.groupId", message: "Choose a live group." },
      ]);
    if (!(await checkRoom(tx, tenantId, program.id, 0)))
      return refuse(409, "TOO_MANY", `A program can have at most ${MAX_PARTICIPANTS} people.`);
    if (row.campusId && (await campusesTakingPart(tx, tenantId, [row.campusId])).get(row.campusId) === false)
      return refuse(409, "CAMPUS_PROGRAMS_OFF", "That campus has switched programs off.");
    await tx.programParticipant.update({
      where: { tenantId_id: { tenantId, id: row.id } },
      data: { status: ProgramPlaceStatus.ACTIVE, endedOn: null, endedReason: null, groupId },
    });
    await writeAudit(tx, tenantId, {
      programId: program.id,
      actorUserId,
      action: "PERSON_REENROLLED",
      targetType: "Participant",
      targetId: row.id,
      before: { status: row.status, groupId: row.groupId },
      after: { name: nameOf(row), groupId },
      reason: input.reason,
    });
    return done({ id: row.id, status: ProgramPlaceStatus.ACTIVE });
  });
}

/// Suspends, lifts, expels or reinstates a person who was typed in. A pupil's or a member of staff's standing is the school's: it is read from their record, and is changed on the Students
/// or Users page, so two screens can never disagree.
export async function changePersonStanding(
  auth: TenantAuthContext,
  programId: string,
  personId: string,
  action: Exclude<StandingAction, "TERMINATE">,
  input: { reason: string; until: string | null },
): Promise<Result<{ standing: string; until: string | null }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(auth, programId, "people", async ({ tx, program, viewer }) => {
    const row = await placeOf(tx, tenantId, program.id, personId, viewer);
    if (!row) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
    if (isLinkedKind(row.kind))
      return refuse(
        409,
        "LINKED",
        row.kind === "STUDENT"
          ? "Change this on the Students page."
          : row.kind === "STAFF"
            ? "Change this on the Users page."
            : "A guardian has no standing to change.",
      );
    const refusal = mayChangeStanding(viewer, action, row.campusId, await maySuspendSwitch.onFor(tx, tenantId, row.campusId), actorUserId);
    if (refusal === "NOT_YOURS") return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
    if (refusal) return refuse(403, "FORBIDDEN", "You don't have permission to do that.");
    const until = action === "SUSPEND" ? input.until : null;
    if (action === "SUSPEND") {
      const problem = suspensionEndProblem(until, today());
      if (problem) return refuse(400, "VALIDATION", problem, [{ path: "body.until", message: problem }]);
    }
    const stored = row.standing === "SUSPENDED" && row.standingUntil && toIsoDate(row.standingUntil) < today() ? "ACTIVE" : row.standing;
    const next = standingAfter(action, "STUDENT", stored) as StandingState | null;
    if (!next) return refuse(409, "NOT_APPLICABLE", "That doesn't apply: nothing is in the state this needs.");
    await tx.programParticipant.update({
      where: { tenantId_id: { tenantId, id: row.id } },
      data: { standing: next, standingUntil: next === "SUSPENDED" && until ? asDate(until) : null },
    });
    await writeEvent(
      tx,
      tenantId,
      {
        subject: StandingSubject.PARTICIPANT,
        participantId: row.id,
        campusId: row.campusId,
        action,
        reason: input.reason,
        endsOn: until,
        decidedByUserId: actorUserId,
      },
      {
        targetType: "ProgramParticipant",
        targetId: row.id,
        before: { standing: row.standing, until: row.standingUntil ? toIsoDate(row.standingUntil) : null },
        after: { standing: next, until },
      },
    );
    await writeAudit(tx, tenantId, {
      programId: program.id,
      actorUserId,
      action: `PERSON_${action}`,
      targetType: "Participant",
      targetId: row.id,
      before: { standing: row.standing },
      after: { name: nameOf(row), standing: next, until },
      reason: input.reason,
    });
    return done({ standing: next, until });
  });
}

/// The standing history of one person typed in, newest first, in the same shape the pupils' and staff histories use, so one dialog shows all three.
export async function personStandingHistory(
  auth: TenantAuthContext,
  programId: string,
  personId: string,
): Promise<Result<{ standing: string; until: string | null; events: HistoryEntry[] }>> {
  const { tenantId } = auth.tenant;
  return auth.tenant.run(async (tx): Promise<Result<{ standing: string; until: string | null; events: HistoryEntry[] }>> => {
    const viewer = await viewerOf(auth, tx, programId);
    if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
    const row = await tx.programParticipant.findFirst({
      where: { tenantId, id: personId, programId, AND: [await reachOf(tx, tenantId, programId, viewer)] },
      select: { id: true, standing: true, standingUntil: true },
    });
    if (!row) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
    const events = await tx.standingEvent.findMany({
      where: { tenantId, participantId: row.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    const names = await namesOf(
      tx,
      tenantId,
      events.map((event) => event.decidedByUserId),
    );
    return done({
      standing: row.standing,
      until: row.standingUntil ? toIsoDate(row.standingUntil) : null,
      events: events.map((event) => ({
        id: event.id,
        action: event.action,
        reason: event.reason,
        startsOn: toIsoDate(event.startsOn),
        endsOn: event.endsOn ? toIsoDate(event.endsOn) : null,
        decidedBy: names.get(event.decidedByUserId) ?? "Someone",
        at: event.createdAt.toISOString(),
      })),
    });
  });
}
