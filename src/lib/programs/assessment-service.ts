import { Prisma, ProgramStatus, type ParticipantKind, type ProgramAssessmentStatus, type ProgramScoreCode } from "@prisma/client";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import type { Tx } from "@/lib/tenant/for-tenant";
import type { ErrorDetail } from "@/lib/api/envelope";
import { asDate, namesOf, today } from "@/lib/standing/common";
import { MIN_REASON } from "@/lib/standing/rules";
import { viewerOf } from "./access";
import {
  MAX_ASSESSMENTS,
  gradeFor,
  parseBands,
  passedAt,
  percentCounted,
  percentOf,
  scoreProblem,
  statusAfter,
  weightedAverage,
  type AssessmentAction,
  type AssessmentStatus,
  type Band,
  type PersonResult,
  type ScoreCode,
} from "./assessment-rules";
import { mayReadGroup, readsEverything, reachOfAccess, rollEntry, type Access } from "./attendance-rules";
import { accessOf } from "./attendance-service";
import { change, done, reading, refuse, writeAudit, type Result } from "./common";
import { featureStateOf, type FeatureState, type FeatureView } from "./feature-switch";
import { groupAndInner, type PlaceState } from "./people-rules";
import { rollPeople, type RollPerson } from "./people-service";
import { groupPath, toIsoDate } from "./rules";
import { assessmentsSwitch } from "./settings-service";

// Programs, slice P3b: assessments (task 0027, section 8.11). An assessment is one dated sitting given to the whole program or to chosen groups; its sheet lists the people it is for,
// once each, with their score or code. Saving scores goes through the same `change()` guard as every other change (the program's row lock, the school's switch, the audit) and is all
// or nothing; every entry and change of a score is kept in an append-only history. Numbers (percentages, grades, averages) are computed from the scores, never stored.

const NOT_FOUND_ASSESSMENT = "That assessment was not found.";
const GROUP_NOT_FOUND = "That group was not found.";

export const assessmentsStateOf = (tx: Tx, tenantId: string, programId: string, programFlag: boolean): Promise<FeatureState> =>
  featureStateOf(tx, tenantId, assessmentsSwitch.stored, programId, programFlag);

type GroupNode = { id: string; parentId: string | null; name: string; archivedAt: Date | null };
type AssessmentRow = Prisma.ProgramAssessmentGetPayload<{ include: { groups: true } }>;

const num = (value: Prisma.Decimal | null): number | null => (value === null ? null : Number(value));
const bandsOf = parseBands;

/// The groups an assessment is for, with everything inside them; null = the whole program.
const audienceOf = (assessment: AssessmentRow, groups: GroupNode[]): string[] | null =>
  assessment.groups.length === 0 ? null : [...new Set(assessment.groups.flatMap((g) => groupAndInner(groups, g.groupId)))];

/// Whether this person may see the assessment at all: a draft only an administrator; otherwise one that is for the whole program, or for a group they reach.
function visibleTo(access: Access, assessment: AssessmentRow, groups: GroupNode[]): boolean {
  // Someone who reaches no group and no campus sees no assessment at all, not even one for the whole program.
  if (!(readsEverything(access) || access.groups.size > 0 || access.campusIds !== null)) return false;
  if (assessment.status === "DRAFT" && !access.markAll) return false;
  const audience = audienceOf(assessment, groups);
  if (audience === null || readsEverything(access) || access.campusIds !== null) return true;
  return audience.some((id) => access.groups.has(id));
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The list

export type AssessmentSummary = {
  id: string;
  title: string;
  kind: string;
  date: string;
  maxScore: number;
  passMark: number | null;
  weight: number;
  required: boolean;
  status: AssessmentStatus;
  whole: boolean;
  groups: { id: string; path: string }[];
  scored: number;
};

export type AssessmentList = {
  assessments: AssessmentSummary[];
  bands: Band[];
  state: FeatureView;
  canCreate: boolean;
};

export async function listAssessments(auth: TenantAuthContext, programId: string): Promise<Result<AssessmentList>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return reading(auth, programId, async ({ tx, viewer }) => {
    const [access, program, groups, rows] = await Promise.all([
      accessOf(tx, tenantId, auth.userId, programId, viewer),
      tx.program.findUniqueOrThrow({
        where: { tenantId, id: programId },
        select: { assessmentsEnabled: true, gradeBands: true, status: true },
      }),
      tx.programGroup.findMany({ where: { tenantId, programId }, select: { id: true, parentId: true, name: true, archivedAt: true } }),
      tx.programAssessment.findMany({
        where: { tenantId, programId },
        include: { groups: true },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
    ]);
    const state = await assessmentsStateOf(tx, tenantId, programId, program.assessmentsEnabled);
    const shown = rows.filter((row) => visibleTo(access, row, groups));
    const counted = await tx.programScore.groupBy({
      by: ["assessmentId"],
      where: { tenantId, assessmentId: { in: shown.map((r) => r.id) }, AND: [{ participant: { is: reachOfAccess(access) } }] },
      _count: { _all: true },
    });
    const scored = new Map(counted.map((c) => [c.assessmentId, c._count._all]));
    return done({
      assessments: shown.map((row) => ({
        id: row.id,
        title: row.title,
        kind: row.kind,
        date: toIsoDate(row.date),
        maxScore: Number(row.maxScore),
        passMark: num(row.passMark),
        weight: Number(row.weight),
        required: row.required,
        status: row.status,
        whole: row.groups.length === 0,
        groups: row.groups.map((g) => ({ id: g.groupId, path: groupPath(groups, g.groupId) })),
        scored: scored.get(row.id) ?? 0,
      })),
      bands: bandsOf(program.gradeBands),
      state: { on: state.on, offBy: state.offBy, campusesOff: state.campusesOff },
      canCreate: access.markAll && state.on && (program.status === "DRAFT" || program.status === "ACTIVE"),
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// One assessment and its sheet

export type SheetScore = {
  id: string;
  score: number | null;
  code: ScoreCode | null;
  comment: string | null;
  version: number;
  markedBy: string;
  updatedAt: string;
  corrected: boolean;
};
export type SheetRow = {
  participantId: string;
  name: string;
  kind: ParticipantKind;
  campusId: string | null;
  groupPath: string;
  /// "SUSPENDED" today: listed as "Not sitting (suspended)", no score can be entered.
  flag: "SUSPENDED" | null;
  listed: boolean;
  campusOff: boolean;
  canEdit: boolean;
  entry: SheetScore | null;
  percent: number | null;
  grade: string | null;
  passed: boolean | null;
};
export type AssessmentDetail = AssessmentSummary & {
  today: string;
  programStatus: ProgramStatus;
  state: FeatureView;
  bands: Band[];
  /// What this person may do now: the status actions, whether details can be edited, whether a changed published score needs a reason.
  rights: { actions: AssessmentAction[]; edit: "ALL" | "LABELS" | null; enter: boolean; reasonOnChange: boolean };
  rows: SheetRow[];
  counts: { expected: number; entered: number; missing: number; average: number | null };
};

async function sheetOf(
  tx: Tx,
  tenantId: string,
  access: Access,
  assessment: AssessmentRow,
  groups: GroupNode[],
  state: FeatureState,
  programId: string,
) {
  const todayDay = today();
  const date = toIsoDate(assessment.date);
  const audience = audienceOf(assessment, groups);
  const reach = reachOfAccess(access);
  const scores = await tx.programScore.findMany({
    where: { tenantId, assessmentId: assessment.id, AND: [{ participant: { is: reach } }] },
  });
  const names = await namesOf(tx, tenantId, [...new Set(scores.map((s) => s.markedByUserId))]);
  const scoreBy = new Map(scores.map((s) => [s.participantId, s]));
  const people = await rollPeople(tx, { tenantId, programId, AND: [audience ? { groupId: { in: audience } } : {}, reach] }, date);
  // Someone with a score who is no longer in the audience (moved, left) is still shown, read only: a sheet is the record of its sitting.
  const missing = scores.map((s) => s.participantId).filter((id) => !people.some((p) => p.id === id));
  const extra = missing.length > 0 ? await rollPeople(tx, { tenantId, programId, AND: [{ id: { in: missing } }, reach] }, date) : [];
  const max = Number(assessment.maxScore);
  const passMark = num(assessment.passMark);
  return { todayDay, date, scoreBy, names, people, extra, max, passMark };
}

function enterAllowed(access: Access, status: AssessmentStatus, groupId: string, date: string, todayDay: string): boolean {
  if (date > todayDay) return false;
  if (status === "OPEN") return access.markAll || access.groups.has(groupId);
  return access.markAll && (status === "MARKED" || status === "PUBLISHED");
}

function actionsFor(access: Access, status: AssessmentStatus, on: boolean, active: boolean): AssessmentAction[] {
  if (!on || !active) return [];
  const all: AssessmentAction[] = ["open", "mark", "reopen", "publish", "archive"];
  return all.filter((action) => statusAfter(status, action) !== null && (access.markAll || (access.supervisor && action === "mark")));
}

export async function getAssessment(auth: TenantAuthContext, programId: string, assessmentId: string): Promise<Result<AssessmentDetail>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return reading(auth, programId, async ({ tx, viewer }) => {
    const [access, program, groups, assessment] = await Promise.all([
      accessOf(tx, tenantId, auth.userId, programId, viewer),
      tx.program.findUniqueOrThrow({
        where: { tenantId, id: programId },
        select: { assessmentsEnabled: true, gradeBands: true, status: true },
      }),
      tx.programGroup.findMany({ where: { tenantId, programId }, select: { id: true, parentId: true, name: true, archivedAt: true } }),
      tx.programAssessment.findFirst({ where: { tenantId, id: assessmentId, programId }, include: { groups: true } }),
    ]);
    if (!assessment || !visibleTo(access, assessment, groups)) return refuse(404, "NOT_FOUND", NOT_FOUND_ASSESSMENT);
    const state = await assessmentsStateOf(tx, tenantId, programId, program.assessmentsEnabled);
    const bands = bandsOf(program.gradeBands);
    const sheet = await sheetOf(tx, tenantId, access, assessment, groups, state, programId);
    const active = program.status === ProgramStatus.ACTIVE;
    const open = state.on && active;

    const rows: SheetRow[] = [];
    let entered = 0;
    let expected = 0;
    const counted: { percent: number | null; weight: number }[] = [];
    for (const person of [...sheet.people, ...sheet.extra]) {
      const place = { status: person.status as "ACTIVE" | "WITHDRAWN" | "COMPLETED", joinedOn: person.joinedOn, endedOn: person.endedOn };
      const entry = rollEntry(place, person.state as PlaceState, sheet.date, sheet.todayDay);
      const score = sheet.scoreBy.get(person.id) ?? null;
      if (!entry.listed && !score) continue;
      const listed = entry.listed && sheet.people.includes(person);
      const campusOn = state.isOn(person.campusId);
      const value = score ? { score: num(score.score), code: score.code as ScoreCode | null } : null;
      const percent = value && value.score !== null ? percentOf(value.score, sheet.max) : null;
      rows.push({
        participantId: person.id,
        name: person.name,
        kind: person.kind,
        campusId: person.campusId,
        groupPath: groupPath(groups, person.groupId),
        flag: entry.flag,
        listed,
        campusOff: !campusOn,
        canEdit:
          open &&
          listed &&
          entry.markable &&
          campusOn &&
          enterAllowed(access, assessment.status, person.groupId, sheet.date, sheet.todayDay),
        entry: score
          ? {
              id: score.id,
              score: value!.score,
              code: value!.code,
              comment: score.comment,
              version: score.version,
              markedBy: sheet.names.get(score.markedByUserId) ?? "A person who has left",
              updatedAt: score.updatedAt.toISOString(),
              corrected: score.version > 1,
            }
          : null,
        percent,
        grade: percent === null ? null : gradeFor(bands, percent),
        passed: value ? passedAt(value.score, sheet.passMark) : null,
      });
      if (listed && entry.markable && campusOn) {
        expected += 1;
        if (score) entered += 1;
      }
      if (value) counted.push({ percent: percentCounted(value, sheet.max), weight: 1 });
    }
    const actions = actionsFor(access, assessment.status, state.on, active);
    return done({
      ...summaryOf(assessment, groups, sheet.scoreBy.size),
      today: sheet.todayDay,
      programStatus: program.status,
      state: { on: state.on, offBy: state.offBy, campusesOff: state.campusesOff },
      bands,
      rights: {
        actions,
        edit: access.markAll && open ? (assessment.status === "DRAFT" ? "ALL" : assessment.status === "OPEN" ? "LABELS" : null) : null,
        enter: rows.some((r) => r.canEdit),
        reasonOnChange: assessment.status === "PUBLISHED",
      },
      rows,
      counts: { expected, entered, missing: expected - entered, average: weightedAverage(counted) },
    });
  });
}

function summaryOf(row: AssessmentRow, groups: GroupNode[], scored: number): AssessmentSummary {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    date: toIsoDate(row.date),
    maxScore: Number(row.maxScore),
    passMark: num(row.passMark),
    weight: Number(row.weight),
    required: row.required,
    status: row.status,
    whole: row.groups.length === 0,
    groups: row.groups.map((g) => ({ id: g.groupId, path: groupPath(groups, g.groupId) })),
    scored,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Making and changing an assessment

export type AssessmentInput = {
  title: string;
  kind: string;
  date: string;
  maxScore: number;
  passMark?: number | null;
  weight: number;
  required: boolean;
  groupIds: string[];
};

const ACTION_AUDIT: Record<AssessmentAction, string> = {
  open: "ASSESSMENT_OPENED",
  mark: "ASSESSMENT_MARKED",
  reopen: "ASSESSMENT_REOPENED",
  publish: "ASSESSMENT_PUBLISHED",
  archive: "ASSESSMENT_ARCHIVED",
};

const OFF = (what: string) => refuse(409, "ASSESSMENTS_OFF", `Assessments are switched off for ${what}.`);

async function liveGroupIds(tx: Tx, tenantId: string, programId: string, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const found = await tx.programGroup.count({ where: { tenantId, programId, id: { in: ids }, archivedAt: null } });
  return found === new Set(ids).size;
}

export async function createAssessment(
  auth: TenantAuthContext,
  programId: string,
  input: AssessmentInput,
): Promise<Result<{ id: string }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(auth, programId, "manage", async ({ tx, program }) => {
    const state = await assessmentsStateOf(tx, tenantId, program.id, program.assessmentsEnabled);
    if (!state.on)
      return OFF(state.offBy === "SCHOOL" ? "the school" : state.offBy === "PROGRAM" ? "this program" : "every campus of this program");
    if ((await tx.programAssessment.count({ where: { tenantId, programId } })) >= MAX_ASSESSMENTS)
      return refuse(409, "TOO_MANY", `A program can have at most ${MAX_ASSESSMENTS} assessments.`);
    if (!(await liveGroupIds(tx, tenantId, programId, input.groupIds))) return refuse(404, "NOT_FOUND", GROUP_NOT_FOUND);
    const created = await tx.programAssessment.create({
      data: {
        tenantId,
        programId,
        title: input.title,
        kind: input.kind,
        date: asDate(input.date),
        maxScore: input.maxScore,
        passMark: input.passMark ?? null,
        weight: input.weight,
        required: input.required,
        createdByUserId: actorUserId,
      },
    });
    // The groups are written on their own: a nested create cannot fill the composite key (program, assessment) that two relations share.
    if (input.groupIds.length > 0)
      await tx.programAssessmentGroup.createMany({
        data: [...new Set(input.groupIds)].map((groupId) => ({ tenantId, assessmentId: created.id, groupId, programId })),
      });
    await writeAudit(tx, tenantId, {
      programId,
      actorUserId,
      action: "ASSESSMENT_CREATED",
      targetType: "Assessment",
      targetId: created.id,
      after: { title: created.title, date: input.date, maxScore: input.maxScore, groups: input.groupIds.length },
    });
    return done({ id: created.id });
  });
}

export type AssessmentChange = Partial<AssessmentInput>;

/// A draft can change anything; an open assessment only its title, kind, pass mark, weight and `required` (its maximum, date and groups are what the scores already mean).
export async function updateAssessment(
  auth: TenantAuthContext,
  programId: string,
  assessmentId: string,
  input: AssessmentChange,
): Promise<Result<{ id: string }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(auth, programId, "manage", async ({ tx, program }) => {
    const state = await assessmentsStateOf(tx, tenantId, program.id, program.assessmentsEnabled);
    if (!state.on) return OFF("this program");
    const current = await tx.programAssessment.findFirst({ where: { tenantId, id: assessmentId, programId }, include: { groups: true } });
    if (!current) return refuse(404, "NOT_FOUND", NOT_FOUND_ASSESSMENT);
    if (current.status !== "DRAFT" && current.status !== "OPEN")
      return refuse(409, "NOT_EDITABLE", "This assessment can't be changed any more.");
    const locked = current.status === "OPEN" && (input.maxScore !== undefined || input.date !== undefined || input.groupIds !== undefined);
    if (locked) return refuse(409, "LOCKED_FIELD", "The maximum, the date and the groups can't change once the assessment is open.");
    const max = input.maxScore ?? Number(current.maxScore);
    const pass = input.passMark === undefined ? num(current.passMark) : input.passMark;
    if (pass !== null && pass > max)
      return refuse(400, "VALIDATION", "The pass mark can't be above the maximum.", [
        { path: "body.passMark", message: "The pass mark can't be above the maximum." },
      ]);
    if (input.groupIds && !(await liveGroupIds(tx, tenantId, programId, input.groupIds))) return refuse(404, "NOT_FOUND", GROUP_NOT_FOUND);
    await tx.programAssessment.update({
      where: { tenantId, id: assessmentId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.date !== undefined ? { date: asDate(input.date) } : {}),
        ...(input.maxScore !== undefined ? { maxScore: input.maxScore } : {}),
        ...(input.passMark !== undefined ? { passMark: input.passMark } : {}),
        ...(input.weight !== undefined ? { weight: input.weight } : {}),
        ...(input.required !== undefined ? { required: input.required } : {}),
      },
    });
    if (input.groupIds) {
      await tx.programAssessmentGroup.deleteMany({ where: { tenantId, assessmentId } });
      if (input.groupIds.length > 0)
        await tx.programAssessmentGroup.createMany({
          data: [...new Set(input.groupIds)].map((groupId) => ({ tenantId, assessmentId, groupId, programId })),
        });
    }
    await writeAudit(tx, tenantId, {
      programId,
      actorUserId,
      action: "ASSESSMENT_CHANGED",
      targetType: "Assessment",
      targetId: assessmentId,
      after: JSON.parse(JSON.stringify(input)),
    });
    return done({ id: assessmentId });
  });
}

/// Open, mark, send back, publish or archive. An administrator any of them; a supervisor only "mark". Marking needs every expected score in.
export async function assessmentAction(
  auth: TenantAuthContext,
  programId: string,
  assessmentId: string,
  action: AssessmentAction,
): Promise<Result<{ status: AssessmentStatus }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(auth, programId, "any", async ({ tx, program, viewer }) => {
    const state = await assessmentsStateOf(tx, tenantId, program.id, program.assessmentsEnabled);
    if (!state.on) return OFF("this program");
    if (program.status !== ProgramStatus.ACTIVE)
      return refuse(409, "PROGRAM_NOT_ACTIVE", "Assessments can be changed only while the program is active.");
    const access = await accessOf(tx, tenantId, auth.userId, programId, viewer);
    const groups = await tx.programGroup.findMany({
      where: { tenantId, programId },
      select: { id: true, parentId: true, name: true, archivedAt: true },
    });
    const current = await tx.programAssessment.findFirst({ where: { tenantId, id: assessmentId, programId }, include: { groups: true } });
    if (!current || !visibleTo(access, current, groups)) return refuse(404, "NOT_FOUND", NOT_FOUND_ASSESSMENT);
    if (!(access.markAll || (access.supervisor && action === "mark")))
      return refuse(403, "FORBIDDEN", "You don't have permission to do that.");
    const next = statusAfter(current.status, action);
    if (!next) return refuse(409, "NOT_APPLICABLE", "That doesn't apply to this assessment as it is.");
    if (action === "mark") {
      const sheet = await sheetOf(tx, tenantId, access, current, groups, state, programId);
      if (sheet.date > sheet.todayDay) return refuse(409, "NOT_YET", "The assessment has not taken place yet.");
      const waiting = sheet.people.filter((person) => {
        const place = { status: person.status as "ACTIVE" | "WITHDRAWN" | "COMPLETED", joinedOn: person.joinedOn, endedOn: person.endedOn };
        const entry = rollEntry(place, person.state as PlaceState, sheet.date, sheet.todayDay);
        return entry.listed && entry.markable && state.isOn(person.campusId) && !sheet.scoreBy.has(person.id);
      });
      // A supervisor or an administrator reads the whole sheet here (their reach is every person), so the count is the real one.
      if (waiting.length > 0)
        return refuse(
          409,
          "INCOMPLETE",
          `${waiting.length} ${waiting.length === 1 ? "person has" : "people have"} no score or code yet.`,
          waiting.slice(0, 20).map((p) => ({ path: `body.${p.id}`, message: `${p.name} has no score yet.` })),
        );
    }
    await tx.programAssessment.update({
      where: { tenantId, id: assessmentId },
      data: { status: next as ProgramAssessmentStatus, ...(next === "PUBLISHED" ? { publishedAt: new Date() } : {}) },
    });
    await writeAudit(tx, tenantId, {
      programId,
      actorUserId,
      action: ACTION_AUDIT[action],
      targetType: "Assessment",
      targetId: assessmentId,
      before: { status: current.status },
      after: { status: next },
    });
    return done({ status: next });
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Saving scores

export type ScoreInput = {
  reason?: string;
  entries: { participantId: string; score?: number; code?: ScoreCode; comment?: string | null; version?: number }[];
};
export type ScoreResult = { created: number; changed: number; unchanged: number };

type Problem = { status: 400 | 403 | 409; code: string; path: string; message: string };
const PRIORITY = ["REASON_REQUIRED", "FORBIDDEN", "NOT_ON_SHEET", "NOT_MARKABLE", "INVALID_SCORE", "CHANGED"];

/// Saves scores: every entry or none. An entry equal to the stored one writes nothing; a change needs the version the screen saw; once the assessment is published a change needs a
/// reason and only an administrator may make it. Every entry and change is kept in the append-only history.
export async function saveScores(
  auth: TenantAuthContext,
  programId: string,
  assessmentId: string,
  input: ScoreInput,
): Promise<Result<ScoreResult>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(auth, programId, "any", async ({ tx, program, viewer }) => {
    const state = await assessmentsStateOf(tx, tenantId, program.id, program.assessmentsEnabled);
    if (!state.on) return OFF("this program");
    if (program.status !== ProgramStatus.ACTIVE)
      return refuse(409, "PROGRAM_NOT_ACTIVE", "Scores can be entered only while the program is active.");
    const access = await accessOf(tx, tenantId, auth.userId, programId, viewer);
    const groups = await tx.programGroup.findMany({
      where: { tenantId, programId },
      select: { id: true, parentId: true, name: true, archivedAt: true },
    });
    const assessment = await tx.programAssessment.findFirst({
      where: { tenantId, id: assessmentId, programId },
      include: { groups: true },
    });
    if (!assessment || !visibleTo(access, assessment, groups)) return refuse(404, "NOT_FOUND", NOT_FOUND_ASSESSMENT);
    if (assessment.status === "DRAFT" || assessment.status === "ARCHIVED")
      return refuse(
        409,
        "NOT_OPEN",
        assessment.status === "DRAFT" ? "Open the assessment before entering scores." : "This assessment is archived.",
      );
    const todayDay = today();
    const date = toIsoDate(assessment.date);
    if (date > todayDay) return refuse(409, "NOT_YET", "The assessment has not taken place yet.");
    if (assessment.status !== "OPEN" && !access.markAll)
      return refuse(403, "FORBIDDEN", "Only an administrator can change scores once the assessment is marked.");

    const ids = input.entries.map((e) => e.participantId);
    if (new Set(ids).size !== ids.length) {
      const message = "A person is in the list twice.";
      return refuse(400, "DUPLICATE_ENTRY", message, [{ path: "body.entries", message }]);
    }
    const audience = audienceOf(assessment, groups);
    const reach = reachOfAccess(access);
    const people = await rollPeople(tx, { tenantId, programId, AND: [audience ? { groupId: { in: audience } } : {}, reach] }, date);
    const byId = new Map<string, RollPerson>(people.map((p) => [p.id, p]));
    const existing = await tx.programScore.findMany({ where: { tenantId, assessmentId, participantId: { in: ids } } });
    const existingBy = new Map(existing.map((s) => [s.participantId, s]));
    const max = Number(assessment.maxScore);
    const reason = input.reason?.trim() || null;
    const published = assessment.status === "PUBLISHED";

    const problems: Problem[] = [];
    const toCreate: { person: RollPerson; score: number | null; code: ScoreCode | null; comment: string | null }[] = [];
    const toChange: {
      person: RollPerson;
      row: (typeof existing)[number];
      score: number | null;
      code: ScoreCode | null;
      comment: string | null;
    }[] = [];
    let unchanged = 0;
    input.entries.forEach((entry, index) => {
      const path = `body.entries.${index}`;
      const person = byId.get(entry.participantId);
      const place = person
        ? { status: person.status as "ACTIVE" | "WITHDRAWN" | "COMPLETED", joinedOn: person.joinedOn, endedOn: person.endedOn }
        : null;
      const onSheet = person && place ? rollEntry(place, person.state as PlaceState, date, todayDay) : null;
      if (!person || !onSheet || !onSheet.listed || !state.isOn(person.campusId)) {
        problems.push({
          status: 409,
          code: "NOT_ON_SHEET",
          path: `${path}.participantId`,
          message: "This person is not on this assessment.",
        });
        return;
      }
      const comment = entry.comment?.trim() || null;
      const score = entry.score ?? null;
      const code = (entry.code ?? null) as ScoreCode | null;
      if (score !== null) {
        const bad = scoreProblem(score, max);
        if (bad) return void problems.push({ status: 400, code: "INVALID_SCORE", path: `${path}.score`, message: bad });
      }
      const current = existingBy.get(person.id);
      if (current && num(current.score) === score && (current.code ?? null) === code && (current.comment ?? null) === comment) {
        unchanged += 1;
        return;
      }
      if (!onSheet.markable)
        return void problems.push({
          status: 409,
          code: "NOT_MARKABLE",
          path: `${path}.participantId`,
          message: `${person.name} is suspended and not sitting.`,
        });
      if (!enterAllowed(access, assessment.status, person.groupId, date, todayDay))
        return void problems.push({ status: 403, code: "FORBIDDEN", path, message: "You can't enter a score for this person." });
      if (!current) {
        if (entry.version !== undefined)
          return void problems.push({
            status: 409,
            code: "CHANGED",
            path: `${path}.version`,
            message: `${person.name}'s score has been removed or never existed. Reload the sheet.`,
          });
        toCreate.push({ person, score, code, comment });
        return;
      }
      if (entry.version !== current.version)
        return void problems.push({
          status: 409,
          code: "CHANGED",
          path: `${path}.version`,
          message: `${person.name}'s score was changed by someone else. Reload the sheet.`,
        });
      toChange.push({ person, row: current, score, code, comment });
    });
    // A published score is corrected by an administrator only, and always with a reason (new entries on a published sheet too: a late sitting is also a correction).
    if (published && toCreate.length + toChange.length > 0 && (!reason || reason.length < MIN_REASON))
      problems.push({
        status: 400,
        code: "REASON_REQUIRED",
        path: "body.reason",
        message: `Say why a published score is being changed (at least ${MIN_REASON} characters).`,
      });
    if (problems.length > 0) {
      const first = [...problems].sort((a, b) => PRIORITY.indexOf(a.code) - PRIORITY.indexOf(b.code))[0]!;
      const same = problems.filter((p) => p.code === first.code);
      const details: ErrorDetail[] = same.map((p) => ({ path: p.path, message: p.message }));
      return refuse(first.status, first.code, same.length === 1 ? first.message : `${first.message} (${same.length} people)`, details);
    }
    if (toCreate.length + toChange.length === 0) return done({ created: 0, changed: 0, unchanged });

    for (const item of toCreate) {
      await tx.programScore.create({
        data: {
          tenantId,
          assessmentId,
          programId,
          participantId: item.person.id,
          campusId: item.person.campusId,
          score: item.score,
          code: item.code,
          comment: item.comment,
          markedByUserId: actorUserId,
        },
      });
      await tx.programScoreChange.create({
        data: {
          tenantId,
          programId,
          assessmentId,
          participantId: item.person.id,
          afterScore: item.score,
          afterCode: item.code,
          reason,
          changedByUserId: actorUserId,
        },
      });
    }
    for (const item of toChange) {
      // `markedByUserId` stays the person who first entered it; the history says who changed it later.
      await tx.programScore.update({
        where: { tenantId, id: item.row.id, version: item.row.version },
        data: { score: item.score, code: item.code, comment: item.comment, version: { increment: 1 } },
      });
      await tx.programScoreChange.create({
        data: {
          tenantId,
          programId,
          assessmentId,
          participantId: item.person.id,
          beforeScore: item.row.score,
          beforeCode: item.row.code,
          afterScore: item.score,
          afterCode: item.code,
          reason,
          changedByUserId: actorUserId,
        },
      });
    }
    await writeAudit(tx, tenantId, {
      programId,
      actorUserId,
      action: toChange.length > 0 ? "SCORES_CORRECTED" : "SCORES_ENTERED",
      targetType: "Assessment",
      targetId: assessmentId,
      after: { created: toCreate.length, changed: toChange.length, unchanged },
      reason,
    });
    return done({ created: toCreate.length, changed: toChange.length, unchanged });
  });
}

/// The history of one person's score on one assessment, newest first.
export async function scoreHistory(
  auth: TenantAuthContext,
  programId: string,
  assessmentId: string,
  personId: string,
): Promise<Result<{ changes: { at: string; by: string; before: string | null; after: string | null; reason: string | null }[] }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return reading(auth, programId, async ({ tx, viewer }) => {
    const [access, groups, assessment] = await Promise.all([
      accessOf(tx, tenantId, auth.userId, programId, viewer),
      tx.programGroup.findMany({ where: { tenantId, programId }, select: { id: true, parentId: true, name: true, archivedAt: true } }),
      tx.programAssessment.findFirst({ where: { tenantId, id: assessmentId, programId }, include: { groups: true } }),
    ]);
    if (!assessment || !visibleTo(access, assessment, groups)) return refuse(404, "NOT_FOUND", NOT_FOUND_ASSESSMENT);
    const person = await tx.programParticipant.findFirst({
      where: { tenantId, id: personId, programId, AND: [reachOfAccess(access)] },
      select: { id: true },
    });
    if (!person) return refuse(404, "NOT_FOUND", "That person was not found.");
    const rows = await tx.programScoreChange.findMany({
      where: { tenantId, programId, assessmentId, participantId: personId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    const names = await namesOf(tx, tenantId, [...new Set(rows.map((r) => r.changedByUserId))]);
    const show = (score: Prisma.Decimal | null, code: ProgramScoreCode | null) => (score !== null ? String(Number(score)) : code);
    return done({
      changes: rows.map((r) => ({
        at: r.createdAt.toISOString(),
        by: names.get(r.changedByUserId) ?? "A person who has left",
        before: show(r.beforeScore, r.beforeCode),
        after: show(r.afterScore, r.afterCode),
        reason: r.reason,
      })),
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Results across the PUBLISHED assessments

export type ResultCell = {
  assessmentId: string;
  title: string;
  percent: number | null;
  grade: string | null;
  passed: boolean | null;
  code: ScoreCode | null;
};
export type ResultRow = {
  participantId: string;
  name: string;
  kind: ParticipantKind;
  groupPath: string;
  cells: ResultCell[];
  average: number | null;
  grade: string | null;
};

/// What each person scored across the published assessments that apply to them (whole program, or a group they are in), with the weighted average. Only people the caller may see.
export async function programResults(
  auth: TenantAuthContext,
  programId: string,
  query: { groupId?: string },
): Promise<Result<{ assessments: { id: string; title: string; weight: number; maxScore: number }[]; rows: ResultRow[]; bands: Band[] }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return reading(auth, programId, async ({ tx, viewer }) => {
    const [access, groups, program] = await Promise.all([
      accessOf(tx, tenantId, auth.userId, programId, viewer),
      tx.programGroup.findMany({ where: { tenantId, programId }, select: { id: true, parentId: true, name: true, archivedAt: true } }),
      tx.program.findUniqueOrThrow({ where: { tenantId, id: programId }, select: { gradeBands: true } }),
    ]);
    if (query.groupId && (!groups.some((g) => g.id === query.groupId) || !mayReadGroup(access, query.groupId)))
      return refuse(404, "NOT_FOUND", GROUP_NOT_FOUND);
    const scope = query.groupId ? groupAndInner(groups, query.groupId) : null;
    const assessments = (
      await tx.programAssessment.findMany({
        where: { tenantId, programId, status: "PUBLISHED" },
        include: { groups: true },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      })
    ).filter((a) => visibleTo(access, a, groups));
    const people = await rollPeople(
      tx,
      { tenantId, programId, AND: [reachOfAccess(access), { status: "ACTIVE" }, scope ? { groupId: { in: scope } } : {}] },
      today(),
    );
    const scores = await tx.programScore.findMany({
      where: { tenantId, assessmentId: { in: assessments.map((a) => a.id) }, participantId: { in: people.map((p) => p.id) } },
    });
    const scoreBy = new Map(scores.map((s) => [`${s.assessmentId}|${s.participantId}`, s]));
    const bands = bandsOf(program.gradeBands);
    const rows: ResultRow[] = people.map((person) => {
      const cells: ResultCell[] = [];
      const counted: { percent: number | null; weight: number }[] = [];
      for (const a of assessments) {
        const audience = audienceOf(a, groups);
        if (audience && !audience.includes(person.groupId)) continue;
        const s = scoreBy.get(`${a.id}|${person.id}`);
        const max = Number(a.maxScore);
        const value = s ? { score: num(s.score), code: s.code as ScoreCode | null } : null;
        const percent = value && value.score !== null ? percentOf(value.score, max) : null;
        cells.push({
          assessmentId: a.id,
          title: a.title,
          percent,
          grade: percent === null ? null : gradeFor(bands, percent),
          passed: value ? passedAt(value.score, num(a.passMark)) : null,
          code: value?.code ?? null,
        });
        if (value) counted.push({ percent: percentCounted(value, max), weight: Number(a.weight) });
      }
      const average = weightedAverage(counted);
      return {
        participantId: person.id,
        name: person.name,
        kind: person.kind,
        groupPath: groupPath(groups, person.groupId),
        cells,
        average,
        grade: average === null ? null : gradeFor(bands, average),
      };
    });
    return done({
      assessments: assessments.map((a) => ({ id: a.id, title: a.title, weight: Number(a.weight), maxScore: Number(a.maxScore) })),
      rows,
      bands,
    });
  });
}

/// For slice P5: each person's results as the completion rule reads them. Every REQUIRED published assessment that applies to the person is included, with `passed: null` when they
/// have no number, so a missing result counts as "not passed". Not limited by reach: the caller is an administrator completing places.
export async function completionResults(
  tx: Tx,
  tenantId: string,
  programId: string,
  people: { id: string; groupId: string }[],
): Promise<Map<string, PersonResult[]>> {
  const groups = await tx.programGroup.findMany({
    where: { tenantId, programId },
    select: { id: true, parentId: true, name: true, archivedAt: true },
  });
  const assessments = await tx.programAssessment.findMany({
    where: { tenantId, programId, status: "PUBLISHED" },
    include: { groups: true },
  });
  const scores = await tx.programScore.findMany({
    where: { tenantId, assessmentId: { in: assessments.map((a) => a.id) }, participantId: { in: people.map((p) => p.id) } },
  });
  const scoreBy = new Map(scores.map((s) => [`${s.assessmentId}|${s.participantId}`, s]));
  const out = new Map<string, PersonResult[]>();
  for (const person of people) {
    const list: PersonResult[] = [];
    for (const a of assessments) {
      const audience = audienceOf(a, groups);
      if (audience && !audience.includes(person.groupId)) continue;
      const s = scoreBy.get(`${a.id}|${person.id}`);
      const value = s ? { score: num(s.score), code: s.code as ScoreCode | null } : null;
      const percent = value ? percentCounted(value, Number(a.maxScore)) : null;
      list.push({
        required: a.required,
        passed: value ? passedAt(value.score, num(a.passMark)) : null,
        percent,
        weight: Number(a.weight),
        counted: percent !== null,
      });
    }
    out.set(person.id, list);
  }
  return out;
}
