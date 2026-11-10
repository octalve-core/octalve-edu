import { Prisma, ProgramKind, ProgramStaffStatus, ProgramStatus } from "@prisma/client";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import type { Tx } from "@/lib/tenant/for-tenant";
import { namesOf } from "@/lib/standing/common";
import { canManage, levelsOf, viewerOf, type ProgramViewer } from "./access";
import { NOT_FOUND, change, done, refuse, writeAudit, type Result } from "./common";
import { parseBands, type Band } from "./assessment-rules";
import { assessmentsStateOf } from "./assessment-service";
import { mayReadGroup, readsEverything } from "./attendance-rules";
import { feesStateOf, reachOf as feesReach } from "./fees-service";
import { accessOf, attendanceStateOf } from "./attendance-service";
import { guardianViewStateOf, studentViewStateOf } from "./progress-family";
import { progressStateOf } from "./progress-service";
import { peopleByGroup } from "./people-service";
import { settingsOf, type ProgramSettings } from "./program-settings-service";
import { campusesTakingPart, schoolEnabled } from "./settings-service";
import { endDateFor, groupPath, isEditableStatus, parseIsoDate, statusAfter, toIsoDate, type StatusAction } from "./rules";
import type { CreateProgramInput, UpdateProgramInput } from "./validation";

// Programs, slice P1: reading, creating, changing and the lifecycle of a program, and the campuses it runs in. The structure (levels, groups) is in structure-service.ts, the program admins in
// staff-service.ts, the school's switch in settings-service.ts.

const dateOrNull = (date: Date | null): string | null => (date ? toIsoDate(date) : null);

export type ProgramSummary = {
  id: string;
  name: string;
  kind: ProgramKind;
  status: ProgramStatus;
  startsOn: string | null;
  endsOn: string | null;
  access: ProgramViewer["level"];
  /// Empty: the program runs school-wide.
  campuses: { id: string; name: string }[];
  groupCount: number;
};

export async function listPrograms(auth: TenantAuthContext): Promise<{ enabled: boolean; programs: ProgramSummary[] }> {
  const { tenantId } = auth.tenant;
  return auth.tenant.run(async (tx) => {
    const levels = await levelsOf(auth, tx);
    const enabled = (await schoolEnabled(tx, tenantId)) !== false;
    // With programs switched off the school's administrator can still read what exists; nobody else is shown anything.
    if (!enabled && !levels.superAdmin) return { enabled, programs: [] };
    const rows = await tx.program.findMany({
      where: { tenantId, ...(levels.superAdmin ? {} : { id: { in: [...levels.admin, ...levels.campus, ...levels.staff] } }) },
      orderBy: [{ name: "asc" }],
      include: {
        campuses: { include: { campus: { select: { id: true, name: true } } } },
        _count: { select: { groups: { where: { archivedAt: null } } } },
      },
    });
    const order: Record<ProgramStatus, number> = { ACTIVE: 0, DRAFT: 1, COMPLETED: 2, ARCHIVED: 3 };
    rows.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
    return {
      enabled,
      programs: rows.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        status: row.status,
        startsOn: dateOrNull(row.startsOn),
        endsOn: dateOrNull(row.endsOn),
        access: levels.superAdmin ? "SUPER" : levels.admin.has(row.id) ? "ADMIN" : levels.campus.has(row.id) ? "CAMPUS" : "STAFF",
        campuses: row.campuses.map((link) => link.campus).sort((a, b) => a.name.localeCompare(b.name)),
        groupCount: row._count.groups,
      })),
    };
  });
}

export type ProgramDetail = {
  id: string;
  name: string;
  description: string | null;
  kind: ProgramKind;
  status: ProgramStatus;
  startsOn: string | null;
  endsOn: string | null;
  createdAt: string;
  access: ProgramViewer["level"];
  /// What this person may do here, decided on the server (a button is shown from this and every action checks again).
  can: { editDetails: boolean; editStructure: boolean; administer: boolean; restore: boolean; managePeople: boolean };
  /// Programs are switched off for the school: the program is read only.
  switchedOff: boolean;
  /// True when the program runs school-wide (it has no campus of its own list).
  schoolWide: boolean;
  campuses: { id: string; name: string; takingPart: boolean }[];
  levelLabels: string[];
  /// `people`: how many open places are in the group and everything inside it, among the people the viewer may see.
  groups: {
    id: string;
    parentId: string | null;
    levelIndex: number;
    name: string;
    sortOrder: number;
    archived: boolean;
    path: string;
    people: number;
  }[];
  admins: { id: string; userId: string; name: string; email: string | null; campusName: string | null }[];
  /// The campuses whose people this viewer may add and manage: every campus of the program for the school's administrator and a program admin, their own for a campus administrator.
  manageCampusIds: string[];
  /// Everyone who works in the program (slice P3): admins, supervisors, teachers and recorders. `groupIds`: for a teacher or a recorder, the groups they are assigned to (empty for the others).
  staff: { id: string; userId: string; name: string; email: string | null; campusName: string | null; role: string; groupIds: string[] }[];
  /// The program's own switches and numbers, for the people who manage it.
  settings: ProgramSettings | null;
  /// Assessments (slice P3b): on, and who decided if not; the program's own switch and grade bands.
  assessments: {
    on: boolean;
    offBy: "SCHOOL" | "PROGRAM" | "CAMPUS" | null;
    campusesOff: { id: string; name: string }[];
    enabled: boolean;
    bands: Band[];
  };
  /// Progress records (R1 to R4): the switch (school, campus, the program's own), the template, whether this person can see any record, and - for the people who manage the program - the
  /// settings and what the school's switches say about what pupils and guardians may see.
  progress: {
    on: boolean;
    offBy: "SCHOOL" | "PROGRAM" | "CAMPUS" | null;
    campusesOff: { id: string; name: string }[];
    enabled: boolean;
    template: string | null;
    reach: boolean;
    studentViewOffBy: "SCHOOL" | "PROGRAM" | "CAMPUS" | null;
    guardianViewOffBy: "SCHOOL" | "PROGRAM" | "CAMPUS" | null;
    canChangeFourEyes: boolean;
  };
  /// Fees (slice P4): the same three-level switch, the program's own flag, and whether this person may see the fees at all (the school's administrator, a program admin, a campus administrator).
  fees: {
    on: boolean;
    offBy: "SCHOOL" | "PROGRAM" | "CAMPUS" | null;
    campusesOff: { id: string; name: string }[];
    enabled: boolean;
    reach: boolean;
  };
  /// Attendance for this program: on, and who turned it off if not (the tab is shown only while it is on).
  attendance: {
    on: boolean;
    offBy: "SCHOOL" | "PROGRAM" | "CAMPUS" | null;
    campusesOff: { id: string; name: string }[];
    enabled: boolean;
    lowPercent: number;
    /// The live groups this person may read the roll of, and the ones they may take it for.
    readGroupIds: string[];
    markGroupIds: string[];
  };
  /// The latest entries, for the people who may manage the program.
  audit: { id: string; action: string; targetType: string; actor: string; at: string; reason: string | null }[] | null;
};

const AUDIT_SHOWN = 50;

export async function getProgram(auth: TenantAuthContext, programId: string): Promise<Result<ProgramDetail>> {
  const { tenantId } = auth.tenant;
  return auth.tenant.run(async (tx): Promise<Result<ProgramDetail>> => {
    const viewer = await viewerOf(auth, tx, programId);
    if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
    const program = await tx.program.findFirst({
      where: { tenantId, id: programId },
      include: {
        campuses: { include: { campus: { select: { id: true, name: true } } } },
        levelLabels: { orderBy: { levelIndex: "asc" } },
        groups: { orderBy: [{ levelIndex: "asc" }, { sortOrder: "asc" }, { name: "asc" }] },
        staff: {
          where: { status: ProgramStaffStatus.ACTIVE },
          include: {
            membership: { include: { user: { select: { name: true, email: true } }, campus: { select: { name: true } } } },
            groups: { select: { groupId: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!program) return refuse(404, "NOT_FOUND", NOT_FOUND);

    const manage = canManage(viewer);
    const switchedOff = (await schoolEnabled(tx, tenantId)) === false;
    const taking = await campusesTakingPart(
      tx,
      tenantId,
      program.campuses.map((link) => link.campusId),
    );
    const editable = manage && !switchedOff && isEditableStatus(program.status);
    const nodes = program.groups.map((group) => ({ id: group.id, parentId: group.parentId, name: group.name }));
    const headCounts = await peopleByGroup(tx, tenantId, viewer, programId, nodes);
    const attendanceState = await attendanceStateOf(tx, tenantId, programId, program.attendanceEnabled);
    const assessmentsState = await assessmentsStateOf(tx, tenantId, programId, program.assessmentsEnabled);
    const feesState = await feesStateOf(tx, tenantId, programId, program.feesEnabled);
    const progressState = await progressStateOf(tx, tenantId, programId, program.progressEnabled);
    const studentView = await studentViewStateOf(tx, tenantId, programId, program.progressStudentView);
    const guardianView = await guardianViewStateOf(tx, tenantId, programId, program.progressGuardianView);
    const access = await accessOf(tx, tenantId, auth.userId, programId, viewer);
    const liveGroupIds = program.groups.filter((group) => group.archivedAt === null).map((group) => group.id);

    let audit: ProgramDetail["audit"] = null;
    if (manage) {
      const rows = await tx.programAudit.findMany({ where: { tenantId, programId }, orderBy: { createdAt: "desc" }, take: AUDIT_SHOWN });
      const names = await namesOf(
        tx,
        tenantId,
        rows.map((row) => row.actorUserId),
      );
      audit = rows.map((row) => ({
        id: row.id,
        action: row.action,
        targetType: row.targetType,
        actor: names.get(row.actorUserId) ?? "A person who has left",
        at: row.createdAt.toISOString(),
        reason: row.reason,
      }));
    }

    return done({
      id: program.id,
      name: program.name,
      description: program.description,
      kind: program.kind,
      status: program.status,
      startsOn: dateOrNull(program.startsOn),
      endsOn: dateOrNull(program.endsOn),
      createdAt: program.createdAt.toISOString(),
      access: viewer.level,
      can: {
        editDetails: editable,
        editStructure: editable,
        administer: viewer.level === "SUPER" && !switchedOff && isEditableStatus(program.status),
        restore: viewer.level === "SUPER" && !switchedOff && program.status === ProgramStatus.ARCHIVED,
        // The school's administrator, a program admin and the administrator of a campus the program runs in (for their own campus's people).
        managePeople: !switchedOff && isEditableStatus(program.status),
      },
      manageCampusIds:
        viewer.level === "STAFF" ? [] : viewer.level === "CAMPUS" ? [viewer.campusId] : program.campuses.map((link) => link.campusId),
      switchedOff,
      schoolWide: program.campuses.length === 0,
      campuses: program.campuses
        .map((link) => ({ id: link.campus.id, name: link.campus.name, takingPart: taking.get(link.campusId) ?? true }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      levelLabels: program.levelLabels.map((label) => label.name),
      groups: program.groups.map((group) => ({
        id: group.id,
        parentId: group.parentId,
        levelIndex: group.levelIndex,
        name: group.name,
        sortOrder: group.sortOrder,
        archived: group.archivedAt !== null,
        path: groupPath(nodes, group.id),
        people: headCounts[group.id] ?? 0,
      })),
      // Who runs the program is shown to everyone who can read it; e-mail addresses only to the people who manage it.
      admins: program.staff
        .filter((place) => place.role === "ADMIN")
        .map((place) => ({
          id: place.id,
          userId: place.userId,
          name: place.membership.user.name ?? place.membership.user.email ?? "Unnamed",
          email: manage ? place.membership.user.email : null,
          campusName: place.membership.campus?.name ?? null,
        })),
      staff: program.staff.map((place) => ({
        id: place.id,
        userId: place.userId,
        name: place.membership.user.name ?? place.membership.user.email ?? "Unnamed",
        email: manage ? place.membership.user.email : null,
        campusName: place.membership.campus?.name ?? null,
        role: place.role,
        groupIds: place.groups.map((row) => row.groupId),
      })),
      settings: manage ? settingsOf(program) : null,
      progress: {
        on: progressState.on,
        offBy: progressState.offBy,
        campusesOff: progressState.campusesOff,
        enabled: program.progressEnabled,
        template: program.progressTemplate,
        reach: readsEverything(access) || access.groups.size > 0 || access.campusIds !== null,
        studentViewOffBy: manage ? studentView.offBy : null,
        guardianViewOffBy: manage ? guardianView.offBy : null,
        canChangeFourEyes: viewer.level === "SUPER",
      },
      fees: {
        on: feesState.on,
        offBy: feesState.offBy,
        campusesOff: feesState.campusesOff,
        enabled: program.feesEnabled,
        reach: feesReach(viewer) !== null,
      },
      assessments: {
        on: assessmentsState.on,
        offBy: assessmentsState.offBy,
        campusesOff: assessmentsState.campusesOff,
        enabled: program.assessmentsEnabled,
        bands: parseBands(program.gradeBands),
      },
      attendance: {
        on: attendanceState.on,
        offBy: attendanceState.offBy,
        campusesOff: attendanceState.campusesOff,
        enabled: program.attendanceEnabled,
        lowPercent: program.lowAttendancePercent,
        readGroupIds: liveGroupIds.filter((id) => mayReadGroup(access, id)),
        markGroupIds: liveGroupIds.filter((id) => access.markAll || access.groups.has(id)),
      },
      audit,
    });
  });
}

async function liveNameTaken(tx: Tx, tenantId: string, name: string, exceptId?: string): Promise<boolean> {
  const found = await tx.program.findFirst({
    where: {
      tenantId,
      name: { equals: name, mode: "insensitive" },
      status: { not: ProgramStatus.ARCHIVED },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  return found !== null;
}

/// Creates a program. The school's administrator only (checked by the route and here): a program is the school's own structure. `campusIds` empty = it runs school-wide.
export async function createProgram(auth: TenantAuthContext, input: CreateProgramInput): Promise<Result<{ id: string }>> {
  const { tenantId } = auth.tenant;
  if (auth.tenant.role !== "ADMIN") return refuse(403, "FORBIDDEN", "You don't have permission to do that.");
  const startsOn = input.startsOn ? parseIsoDate(input.startsOn) : null;
  let endsOn = input.endsOn ? parseIsoDate(input.endsOn) : null;
  if (input.kind === ProgramKind.FIXED_TERM && startsOn && input.duration) endsOn = endDateFor(startsOn, input.duration);
  try {
    return await auth.tenant.run(async (tx): Promise<Result<{ id: string }>> => {
      if ((await schoolEnabled(tx, tenantId)) === false) return refuse(409, "PROGRAMS_OFF", "Programs are switched off for the school.");
      const campuses =
        input.campusIds.length > 0
          ? await tx.campus.findMany({ where: { tenantId, id: { in: input.campusIds } }, select: { id: true, name: true } })
          : [];
      if (campuses.length !== input.campusIds.length)
        return refuse(400, "VALIDATION", "One of the campuses was not found.", [
          { path: "body.campusIds", message: "One of the campuses was not found." },
        ]);
      const taking = await campusesTakingPart(
        tx,
        tenantId,
        campuses.map((campus) => campus.id),
      );
      const off = campuses.filter((campus) => taking.get(campus.id) === false);
      if (off.length > 0) {
        const message = `${off.map((campus) => campus.name).join(", ")} ${off.length === 1 ? "has" : "have"} switched programs off.`;
        return refuse(409, "CAMPUS_PROGRAMS_OFF", message, [{ path: "body.campusIds", message }]);
      }
      if (await liveNameTaken(tx, tenantId, input.name))
        return refuse(409, "DUPLICATE", "A program with this name already exists.", [
          { path: "body.name", message: "A program with this name already exists." },
        ]);
      const program = await tx.program.create({
        data: {
          tenantId,
          name: input.name,
          description: input.description?.trim() || null,
          kind: input.kind,
          status: ProgramStatus.DRAFT,
          startsOn,
          endsOn: input.kind === ProgramKind.FIXED_TERM ? endsOn : null,
          createdByUserId: auth.userId,
        },
      });
      if (campuses.length > 0)
        await tx.programCampus.createMany({ data: campuses.map((campus) => ({ tenantId, programId: program.id, campusId: campus.id })) });
      await tx.programLevelLabel.createMany({
        data: input.levelLabels.map((name, levelIndex) => ({ tenantId, programId: program.id, levelIndex, name })),
      });
      await writeAudit(tx, tenantId, {
        programId: program.id,
        actorUserId: auth.userId,
        action: "PROGRAM_CREATED",
        targetType: "Program",
        targetId: program.id,
        after: {
          name: program.name,
          kind: program.kind,
          startsOn: dateOrNull(program.startsOn),
          endsOn: dateOrNull(program.endsOn),
          campuses: campuses.map((campus) => campus.id),
          levelLabels: input.levelLabels,
        },
      });
      return done({ id: program.id });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return refuse(409, "DUPLICATE", "A program with this name already exists.", [
        { path: "body.name", message: "A program with this name already exists." },
      ]);
    throw error;
  }
}

export async function updateProgram(
  auth: TenantAuthContext,
  programId: string,
  input: UpdateProgramInput,
): Promise<Result<{ id: string }>> {
  const { tenantId } = auth.tenant;
  return change(auth, programId, "manage", async ({ tx, program }) => {
    const bad = (path: string, message: string) => refuse(400, "VALIDATION", message, [{ path: `body.${path}`, message }]);
    const startsOn = input.startsOn === undefined ? program.startsOn : input.startsOn === null ? null : parseIsoDate(input.startsOn);
    const endsOn = input.endsOn === undefined ? program.endsOn : input.endsOn === null ? null : parseIsoDate(input.endsOn);
    if (program.kind === ProgramKind.ONGOING && input.endsOn) return bad("endsOn", "A program that never ends has no end date.");
    if (program.kind === ProgramKind.FIXED_TERM) {
      if (!startsOn) return bad("startsOn", "A program for a period needs a start date.");
      if (!endsOn) return bad("endsOn", "A program for a period needs an end date.");
      if (endsOn <= startsOn) return bad("endsOn", "The end date must be after the start date.");
    }
    if (
      input.name !== undefined &&
      input.name.toLowerCase() !== program.name.toLowerCase() &&
      (await liveNameTaken(tx, tenantId, input.name, program.id))
    )
      return refuse(409, "DUPLICATE", "A program with this name already exists.", [
        { path: "body.name", message: "A program with this name already exists." },
      ]);
    const data: Prisma.ProgramUpdateInput = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const track = (key: string, was: unknown, now: unknown) => {
      if (JSON.stringify(was) === JSON.stringify(now)) return false;
      before[key] = was;
      after[key] = now;
      return true;
    };
    if (input.name !== undefined && track("name", program.name, input.name)) data.name = input.name;
    if (input.description !== undefined) {
      const next = input.description === null || input.description.trim() === "" ? null : input.description.trim();
      if (track("description", program.description, next)) data.description = next;
    }
    if (input.startsOn !== undefined && track("startsOn", dateOrNull(program.startsOn), dateOrNull(startsOn))) data.startsOn = startsOn;
    if (input.endsOn !== undefined && track("endsOn", dateOrNull(program.endsOn), dateOrNull(endsOn))) data.endsOn = endsOn;
    if (Object.keys(data).length === 0) return done({ id: program.id });
    await tx.program.update({ where: { tenantId_id: { tenantId, id: program.id } }, data });
    await writeAudit(tx, tenantId, {
      programId: program.id,
      actorUserId: auth.userId,
      action: "PROGRAM_CHANGED",
      targetType: "Program",
      targetId: program.id,
      before: before as Prisma.InputJsonObject,
      after: after as Prisma.InputJsonObject,
    });
    return done({ id: program.id });
  });
}

/// Activate, archive (a draft or active program; read only afterwards) or restore (the school's administrator brings an archived program back as a draft). COMPLETED is reached only by
/// slice P5's complete action.
export async function changeStatus(
  auth: TenantAuthContext,
  programId: string,
  action: StatusAction,
): Promise<Result<{ status: ProgramStatus }>> {
  const { tenantId } = auth.tenant;
  return change(
    auth,
    programId,
    action === "restore" ? "super" : "manage",
    async ({ tx, program }) => {
      const next = statusAfter(action, program.status);
      if (!next) return refuse(409, "NOT_APPLICABLE", `A ${program.status.toLowerCase()} program can't be ${action}d.`);
      if (action === "restore" && (await liveNameTaken(tx, tenantId, program.name, program.id)))
        return refuse(409, "DUPLICATE", "Another program now has this name. Rename that one first.");
      await tx.program.update({
        where: { tenantId_id: { tenantId, id: program.id } },
        data: { status: next, archivedAt: next === ProgramStatus.ARCHIVED ? new Date() : null },
      });
      await writeAudit(tx, tenantId, {
        programId: program.id,
        actorUserId: auth.userId,
        action: action === "activate" ? "PROGRAM_ACTIVATED" : action === "archive" ? "PROGRAM_ARCHIVED" : "PROGRAM_RESTORED",
        targetType: "Program",
        targetId: program.id,
        before: { status: program.status },
        after: { status: next },
      });
      return done({ status: next });
    },
    { allowArchived: action === "restore" },
  );
}

/// Adds a campus to a program that already runs in campuses. A school-wide program is not narrowed here (that would change who may see it): it is made with the campuses it should run in.
export async function linkCampus(auth: TenantAuthContext, programId: string, campusId: string): Promise<Result<{ campusId: string }>> {
  const { tenantId } = auth.tenant;
  return change(auth, programId, "super", async ({ tx, program }) => {
    const campus = await tx.campus.findFirst({ where: { tenantId, id: campusId }, select: { id: true, name: true } });
    if (!campus) return refuse(404, "NOT_FOUND", "That campus was not found.");
    const current = await tx.programCampus.count({ where: { tenantId, programId: program.id } });
    if (current === 0) return refuse(409, "SCHOOL_WIDE", "This program runs school-wide. It is not narrowed to campuses after it is made.");
    if (await tx.programCampus.findUnique({ where: { programId_campusId: { programId: program.id, campusId } } }))
      return refuse(409, "ALREADY_LINKED", "The program already runs in this campus.");
    if ((await campusesTakingPart(tx, tenantId, [campusId])).get(campusId) === false)
      return refuse(409, "CAMPUS_PROGRAMS_OFF", `${campus.name} has switched programs off.`);
    await tx.programCampus.create({ data: { tenantId, programId: program.id, campusId } });
    await writeAudit(tx, tenantId, {
      programId: program.id,
      actorUserId: auth.userId,
      action: "CAMPUS_LINKED",
      targetType: "Campus",
      targetId: campusId,
      after: { name: campus.name },
    });
    return done({ campusId });
  });
}

export async function unlinkCampus(auth: TenantAuthContext, programId: string, campusId: string): Promise<Result<{ campusId: string }>> {
  const { tenantId } = auth.tenant;
  return change(auth, programId, "super", async ({ tx, program }) => {
    const link = await tx.programCampus.findUnique({
      where: { programId_campusId: { programId: program.id, campusId } },
      include: { campus: { select: { name: true } } },
    });
    if (!link || link.tenantId !== tenantId) return refuse(404, "NOT_FOUND", "The program does not run in that campus.");
    if ((await tx.programCampus.count({ where: { tenantId, programId: program.id } })) <= 1)
      return refuse(
        409,
        "LAST_CAMPUS",
        "A program that runs in campuses must keep at least one. It is not made school-wide after it is made.",
      );
    // A campus cannot leave while any person IS or WAS in the program through it (the person keeps their history with the campus).
    const people = await tx.programParticipant.count({ where: { tenantId, programId: program.id, campusId } });
    if (people > 0) return refuse(409, "CAMPUS_HAS_PEOPLE", "People are in this program through that campus. They would lose their place.");
    const serving = await tx.programStaff.count({
      where: { tenantId, programId: program.id, status: ProgramStaffStatus.ACTIVE, membership: { campusId } },
    });
    if (serving > 0) return refuse(409, "CAMPUS_IN_USE", "End the program admins who serve through this campus first.");
    await tx.programCampus.delete({ where: { programId_campusId: { programId: program.id, campusId } } });
    await writeAudit(tx, tenantId, {
      programId: program.id,
      actorUserId: auth.userId,
      action: "CAMPUS_UNLINKED",
      targetType: "Campus",
      targetId: campusId,
      before: { name: link.campus.name },
    });
    return done({ campusId });
  });
}
