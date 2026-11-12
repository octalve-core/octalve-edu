import { Prisma, ProgressEntryStatus, type Program, type ProgressWriters } from "@prisma/client";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import type { Tx } from "@/lib/tenant/for-tenant";
import type { ErrorDetail } from "@/lib/api/envelope";
import { asDate, namesOf, today } from "@/lib/standing/common";
import { assignedGroupsByRole, viewerOf, type ProgramViewer } from "./access";
import { accessOf } from "./attendance-service";
import { reachOfAccess, type Access } from "./attendance-rules";
import { NOT_FOUND, change, done, reading, refuse, writeAudit, type Result } from "./common";
import { featureStateOf, type FeatureState, type FeatureView } from "./feature-switch";
import { groupAndInner } from "./people-rules";
import { billingPeople, rollPeople } from "./people-service";
import {
  DEFAULT_RANGE_DAYS,
  MAX_LOADED_ENTRIES,
  MAX_RANGE_DAYS,
  PAGE_SIZE,
  addDays,
  canWrite,
  dayDiff,
  entryDayProblem,
  lockActive,
  lockExpiry,
  mayVerify,
  nextFrom,
  parseProfile,
  parseValues,
  sameJson,
  statusAfterSave,
  weekDates,
  weekStartOf,
  writerRoles,
  type EntryStatus,
  type RangeValue,
  type Values,
} from "./progress-rules";
import { PRESET_KEYS, isPresetKey, presetSchema, readSchema, trackOf, type TemplateSchema } from "./progress-templates";
import { groupPath, toIsoDate } from "./rules";
import { progressSwitch } from "./settings-service";

// Progress records, slices R1 and R2 (task 0030): the running log a teacher keeps for each person in a program, entries by day, verification and the lock on an entry. Reading never
// creates anything. Every write goes through the same `change()` guard as the rest of programs (the program's row lock, the school's switch, a program that is archived or
// completed) and checks BEFORE its first write: a refusal does not undo writes already made. Nothing is ever deleted; every save is in the revision history.

const PERSON_NOT_FOUND = "That person was not found.";
const ENTRY_NOT_FOUND = "That entry was not found.";
const OFF_MESSAGE = "Progress records are switched off for this program.";
const NOT_STARTED = "Progress records are not set up for this program yet. A program admin chooses a template in the program's Settings.";
const NOT_ACTIVE = "This place is not taking part, so its record can't be written to.";

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The switch, the template and who may do what

export const progressStateOf = (tx: Tx, tenantId: string, programId: string, programFlag: boolean): Promise<FeatureState> =>
  featureStateOf(tx, tenantId, progressSwitch.stored, programId, programFlag);

export type ProgressSettings = {
  writers: ProgressWriters;
  requireVerification: boolean;
  fourEyes: boolean;
  lockInactivity: number;
  lockRelease: number;
  /// Days the calculated Hijri date is moved for this program.
  hijriAdjust: number;
};
export const progressSettingsOf = (
  program: Pick<
    Program,
    | "progressWriters"
    | "progressRequireVerification"
    | "progressFourEyes"
    | "progressLockInactivity"
    | "progressLockRelease"
    | "progressHijriAdjust"
  >,
): ProgressSettings => ({
  writers: program.progressWriters,
  requireVerification: program.progressRequireVerification,
  fourEyes: program.progressFourEyes,
  lockInactivity: program.progressLockInactivity,
  lockRelease: program.progressLockRelease,
  hijriAdjust: program.progressHijriAdjust,
});

type TemplateRow = { id: string; key: string; version: number; schema: TemplateSchema };

/// The template the program uses: the newest version of the preset it chose. Null when none was chosen.
export async function templateOf(
  client: Pick<Tx, "progressTemplate">,
  tenantId: string,
  program: Pick<Program, "id" | "progressTemplate">,
): Promise<TemplateRow | null> {
  if (!program.progressTemplate) return null;
  const row = await client.progressTemplate.findFirst({
    where: { tenantId, programId: program.id, key: program.progressTemplate },
    orderBy: { version: "desc" },
  });
  const schema = row ? readSchema(row.schema) : null;
  return row && schema ? { id: row.id, key: row.key, version: row.version, schema } : null;
}

export type ProgressAccess = {
  userId: string;
  admin: boolean;
  supervisor: boolean;
  /// What the person may READ (the attendance reach: everything, their groups, or their campuses).
  read: Access;
  writeAll: boolean;
  writeGroups: ReadonlySet<string>;
};

export async function progressAccessOf(
  tx: Tx,
  tenantId: string,
  userId: string,
  programId: string,
  viewer: ProgramViewer,
  writers: ProgressWriters,
): Promise<ProgressAccess> {
  const read = await accessOf(tx, tenantId, userId, programId, viewer);
  const admin = viewer.level === "SUPER" || viewer.level === "ADMIN";
  if (admin) return { userId, admin, supervisor: true, read, writeAll: true, writeGroups: new Set() };
  const byRole = await assignedGroupsByRole(tx, tenantId, userId, programId);
  const groups = new Set(writerRoles(writers).flatMap((role) => byRole[role]));
  return { userId, admin, supervisor: read.supervisor, read, writeAll: false, writeGroups: groups };
}

const canVerifyAtAll = (access: ProgressAccess): boolean => access.admin || access.supervisor;

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Reading: the list of people

export type OverviewRow = {
  participantId: string;
  name: string;
  kind: string;
  campusId: string | null;
  groupId: string;
  groupPath: string;
  state: string;
  hasRecord: boolean;
  entries: number;
  lastEntryOn: string | null;
  waiting: number;
  canWrite: boolean;
};
export type ProgressStateView = FeatureView;
export type Overview = {
  state: ProgressStateView;
  programStatus: string;
  template: { key: string; name: { en: string; ar: string }; version: number } | null;
  presets: { key: string; name: { en: string; ar: string } }[];
  settings: ProgressSettings;
  rights: { write: boolean; verify: boolean };
  people: OverviewRow[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  /// People typed in (an adult, a child, a guardian) have no portal sign-in, so their families cannot see their record.
  familyNote: string;
};

const stateView = (state: FeatureState): ProgressStateView => ({ on: state.on, offBy: state.offBy, campusesOff: state.campusesOff });

export async function getOverview(
  auth: TenantAuthContext,
  programId: string,
  query: { q?: string; groupId?: string; page: number },
): Promise<Result<Overview>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return reading(auth, programId, async ({ tx, viewer }) => {
    const program = await tx.program.findUnique({ where: { tenantId, id: programId } });
    if (!program) return refuse(404, "NOT_FOUND", NOT_FOUND);
    const [state, template, groups] = await Promise.all([
      progressStateOf(tx, tenantId, programId, program.progressEnabled),
      templateOf(tx, tenantId, program),
      tx.programGroup.findMany({ where: { tenantId, programId }, select: { id: true, parentId: true, name: true, archivedAt: true } }),
    ]);
    const access = await progressAccessOf(tx, tenantId, actorUserId, programId, viewer, program.progressWriters);
    const day = today();
    const scope: Prisma.ProgramParticipantWhereInput[] = [reachOfAccess(access.read)];
    if (query.groupId) scope.push({ groupId: { in: groupAndInner(groups, query.groupId) } });
    const everyone = await rollPeople(tx, { tenantId, programId, AND: scope }, day);
    const needle = query.q?.trim().toLowerCase();
    const matching = needle ? everyone.filter((person) => person.name.toLowerCase().includes(needle)) : everyone;
    const start = (query.page - 1) * PAGE_SIZE;
    const page = matching.slice(start, start + PAGE_SIZE);
    const records = page.length
      ? await tx.progressRecord.findMany({
          where: { tenantId, programId, participantId: { in: page.map((p) => p.id) } },
          select: { id: true, participantId: true },
        })
      : [];
    const byRecord = new Map(records.map((record) => [record.id, record.participantId]));
    const [counts, waiting] = records.length
      ? await Promise.all([
          tx.progressEntry.groupBy({
            by: ["recordId"],
            where: { tenantId, recordId: { in: records.map((r) => r.id) } },
            _count: { _all: true },
            _max: { entryDate: true },
          }),
          tx.progressEntry.groupBy({
            by: ["recordId"],
            where: { tenantId, recordId: { in: records.map((r) => r.id) }, status: ProgressEntryStatus.SUBMITTED },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const stat = new Map(counts.map((c) => [byRecord.get(c.recordId)!, c]));
    const wait = new Map(waiting.map((w) => [byRecord.get(w.recordId)!, w._count._all]));
    const people: OverviewRow[] = page.map((person) => ({
      participantId: person.id,
      name: person.name,
      kind: person.kind,
      campusId: person.campusId,
      groupId: person.groupId,
      groupPath: groupPath(groups, person.groupId),
      state: person.state,
      hasRecord: byRecord.size > 0 && [...byRecord.values()].includes(person.id),
      entries: stat.get(person.id)?._count._all ?? 0,
      lastEntryOn: stat.get(person.id)?._max.entryDate ? toIsoDate(stat.get(person.id)!._max.entryDate!) : null,
      waiting: wait.get(person.id) ?? 0,
      canWrite: canWrite(access, person.groupId, person.state) && state.isOn(person.campusId),
    }));
    return done({
      state: stateView(state),
      programStatus: program.status,
      template: template ? { key: template.key, name: template.schema.name, version: template.version } : null,
      presets: PRESET_KEYS.map((key) => ({ key, name: presetSchema(key).name })),
      settings: progressSettingsOf(program),
      rights: { write: access.writeAll || access.writeGroups.size > 0, verify: canVerifyAtAll(access) },
      people,
      total: matching.length,
      page: query.page,
      pageSize: PAGE_SIZE,
      hasNext: start + PAGE_SIZE < matching.length,
      familyNote:
        "Pupils and their guardians see a verified record in the portal. People typed in (an adult, a child, a guardian) have no portal sign-in, so their families cannot see their record yet.",
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Reading: one person's record

export type LockView = { holder: string; mine: boolean; expiresAt: string; releasing: boolean };
export type EntryView = {
  id: string;
  trackKey: string;
  entryDate: string;
  values: Values;
  status: EntryStatus;
  version: number;
  createdBy: string;
  lastEditedBy: string;
  lastEditedAt: string;
  returnComment: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  /// Families see a copy of this entry (the last verified one), whatever its status is now.
  published: boolean;
  lock: LockView | null;
  canEdit: boolean;
  canVerify: boolean;
};
export type RecordView = {
  state: ProgressStateView;
  programStatus: string;
  person: {
    participantId: string;
    name: string;
    kind: string;
    groupPath: string;
    campusId: string | null;
    placeState: string;
    joinedOn: string;
    guardianName: string | null;
    guardianPhone: string | null;
  };
  template: { key: string; version: number; schema: TemplateSchema } | null;
  record: { id: string; profile: Record<string, string>; version: number } | null;
  settings: ProgressSettings;
  rights: { write: boolean; whyNot: string | null; verify: boolean };
  from: string;
  to: string;
  weekStart: string | null;
  entries: EntryView[];
  /// Where the next range of each track starts: the ayah after the last one done.
  next: Record<string, { surah: number; ayah: number } | null>;
  seen: { actor: string; weekStart: string; seenAt: string }[];
  truncated: boolean;
};

const isRangeValue = (value: unknown): value is RangeValue => !!value && typeof value === "object" && "toSurah" in value;

async function entryViews(
  tx: Tx,
  tenantId: string,
  rows: Prisma.ProgressEntryGetPayload<{ include: { lock: true } }>[],
  access: ProgressAccess,
  settings: ProgressSettings,
  canWriteHere: boolean,
  now: Date,
): Promise<EntryView[]> {
  const names = await namesOf(
    tx,
    tenantId,
    rows.flatMap((row) =>
      [row.createdByUserId, row.lastEditedByUserId, row.verifiedByUserId, row.lock?.holderUserId].filter((id): id is string => !!id),
    ),
  );
  return rows.map((row) => {
    const lock = lockActive(row.lock, now) ? row.lock : null;
    return {
      id: row.id,
      trackKey: row.trackKey,
      entryDate: toIsoDate(row.entryDate),
      values: row.values as Values,
      status: row.status,
      version: row.version,
      createdBy: names.get(row.createdByUserId) ?? "A person who has left",
      lastEditedBy: names.get(row.lastEditedByUserId) ?? "A person who has left",
      lastEditedAt: row.updatedAt.toISOString(),
      returnComment: row.returnComment,
      verifiedBy: row.verifiedByUserId ? (names.get(row.verifiedByUserId) ?? "A person who has left") : null,
      verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
      published: row.publishedAt !== null,
      lock: lock
        ? {
            holder: names.get(lock.holderUserId) ?? "Someone",
            mine: lock.holderUserId === access.userId,
            expiresAt: lock.expiresAt.toISOString(),
            releasing: lock.releaseAt !== null,
          }
        : null,
      canEdit: canWriteHere && (!lock || lock.holderUserId === access.userId),
      canVerify:
        row.status === "SUBMITTED" &&
        mayVerify({ admin: access.admin, supervisor: access.supervisor, userId: access.userId }, row, settings.fourEyes),
    };
  });
}

export async function getRecord(
  auth: TenantAuthContext,
  programId: string,
  personId: string,
  query: { from?: string; to?: string; trackKey?: string },
): Promise<Result<RecordView>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return reading(auth, programId, async ({ tx, viewer }) => {
    const program = await tx.program.findUnique({ where: { tenantId, id: programId } });
    if (!program) return refuse(404, "NOT_FOUND", NOT_FOUND);
    const access = await progressAccessOf(tx, tenantId, actorUserId, programId, viewer, program.progressWriters);
    const day = today();
    const [person] = await billingPeople(tx, { tenantId, id: personId, programId, AND: [reachOfAccess(access.read)] }, day);
    if (!person) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
    const [state, template, groups, record] = await Promise.all([
      progressStateOf(tx, tenantId, programId, program.progressEnabled),
      templateOf(tx, tenantId, program),
      tx.programGroup.findMany({ where: { tenantId, programId }, select: { id: true, parentId: true, name: true } }),
      tx.progressRecord.findFirst({ where: { tenantId, programId: program.id, participantId: personId } }),
    ]);
    const settings = progressSettingsOf(program);
    const to = query.to ?? day;
    let from = query.from ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1));
    if (from > to)
      return refuse(400, "VALIDATION", "The start can't be after the end.", [
        { path: "query.from", message: "The start can't be after the end." },
      ]);
    if (dayDiff(to, from) > MAX_RANGE_DAYS) from = addDays(to, -MAX_RANGE_DAYS);
    const tableKeys = template?.schema.tracks.filter((track) => track.kind === "table").map((track) => track.key) ?? [];
    const noteKeys = template?.schema.tracks.filter((track) => track.kind === "notes").map((track) => track.key) ?? [];
    const rows = record
      ? await tx.progressEntry.findMany({
          where: {
            tenantId,
            recordId: record.id,
            ...(query.trackKey ? { trackKey: query.trackKey } : {}),
            OR: [{ trackKey: { in: tableKeys }, entryDate: { gte: asDate(from), lte: asDate(to) } }, { trackKey: { in: noteKeys } }],
          },
          include: { lock: true },
          orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
          take: MAX_LOADED_ENTRIES + 1,
        })
      : [];
    const truncated = rows.length > MAX_LOADED_ENTRIES;
    if (truncated) rows.pop();
    const writeReason = writeBlock(access, person.groupId, person.state, state, person.campusId, template !== null);
    const now = new Date();
    const entries = await entryViews(tx, tenantId, rows, access, settings, writeReason === null, now);

    const next: RecordView["next"] = {};
    if (record && template)
      for (const track of template.schema.tracks) {
        const rangeKey = track.columns.find((column) => column.type === "range")?.key;
        if (!rangeKey) continue;
        const last = await tx.progressEntry.findFirst({
          where: { tenantId, recordId: record.id, trackKey: track.key },
          orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
        });
        const value = last ? (last.values as Record<string, unknown>)[rangeKey] : null;
        next[track.key] = isRangeValue(value) ? nextFrom(value) : null;
      }
    const seen = record
      ? (await tx.progressSeen.findMany({ where: { tenantId, recordId: record.id }, orderBy: { weekStart: "desc" }, take: 16 })).map(
          (row) => ({
            actor: row.actor,
            weekStart: toIsoDate(row.weekStart),
            seenAt: row.seenAt.toISOString(),
          }),
        )
      : [];
    const mayContact = access.admin || access.writeAll || access.writeGroups.has(person.groupId);
    return done({
      state: stateView(state),
      programStatus: program.status,
      person: {
        participantId: person.id,
        name: person.name,
        kind: person.kind,
        groupPath: groupPath(groups, person.groupId),
        campusId: person.campusId,
        placeState: person.state,
        joinedOn: toIsoDate(person.joinedOn),
        guardianName: mayContact ? person.guardianName : null,
        guardianPhone: mayContact ? (person.guardianPhone ?? person.ownPhone) : null,
      },
      template: template ? { key: template.key, version: template.version, schema: template.schema } : null,
      record: record ? { id: record.id, profile: record.profile as Record<string, string>, version: record.version } : null,
      settings,
      rights: { write: writeReason === null, whyNot: writeReason, verify: canVerifyAtAll(access) },
      from,
      to,
      weekStart: template ? weekStartOf(to, template.schema.weekStart) : null,
      entries,
      next,
      seen,
      truncated,
    });
  });
}

/// Why this person may not write to this record right now, or null when they may.
function writeBlock(
  access: ProgressAccess,
  groupId: string,
  placeState: string,
  state: FeatureState,
  campusId: string | null,
  hasTemplate: boolean,
): string | null {
  if (!state.on) return OFF_MESSAGE;
  if (!hasTemplate) return NOT_STARTED;
  if (!state.isOn(campusId)) return "Progress records are switched off for this person's campus.";
  if (!canWrite(access, groupId, "ACTIVE")) return "You are not named to write to this person's group.";
  if (placeState !== "ACTIVE") return NOT_ACTIVE;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Writing: the shared preparation

type PersonRow = Awaited<ReturnType<typeof rollPeople>>[number];
type Prepared = {
  tx: Tx;
  tenantId: string;
  program: Program;
  actor: string;
  access: ProgressAccess;
  settings: ProgressSettings;
  template: TemplateRow;
  person: PersonRow;
  recordId: string | null;
  day: string;
  joinedOn: string;
};

/// The checks every write to a record makes, BEFORE any write: the switch, the template, the person (404 when out of reach), the right to write (403, or 409 for a place not taking part).
async function prepare(
  tx: Tx,
  tenantId: string,
  program: Program,
  viewer: ProgramViewer,
  actor: string,
  personId: string,
): Promise<Result<Prepared>> {
  const settings = progressSettingsOf(program);
  const access = await progressAccessOf(tx, tenantId, actor, program.id, viewer, program.progressWriters);
  const day = today();
  const [person] = await rollPeople(tx, { tenantId, id: personId, programId: program.id, AND: [reachOfAccess(access.read)] }, day);
  if (!person) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
  const state = await progressStateOf(tx, tenantId, program.id, program.progressEnabled);
  if (!state.on) return refuse(409, "PROGRESS_OFF", OFF_MESSAGE);
  if (!state.isOn(person.campusId)) return refuse(409, "BRANCH_OFF", "Progress records are switched off for this person's campus.");
  const template = await templateOf(tx, tenantId, program);
  if (!template) return refuse(409, "NOT_STARTED", NOT_STARTED);
  if (!canWrite(access, person.groupId, "ACTIVE")) return refuse(403, "FORBIDDEN", "You are not named to write to this person's group.");
  if (person.state !== "ACTIVE") return refuse(409, "NOT_ACTIVE", NOT_ACTIVE);
  const record = await tx.progressRecord.findFirst({
    where: { tenantId, programId: program.id, participantId: personId },
    select: { id: true },
  });
  return done({
    tx,
    tenantId,
    program,
    actor,
    access,
    settings,
    template,
    person,
    recordId: record?.id ?? null,
    day,
    joinedOn: toIsoDate(person.joinedOn),
  });
}

async function ensureRecord(p: Prepared): Promise<string> {
  const { tenantId } = p;
  if (p.recordId) return p.recordId;
  const created = await p.tx.progressRecord.create({
    data: { tenantId, programId: p.program.id, participantId: p.person.id, templateId: p.template.id, createdByUserId: p.actor },
    select: { id: true },
  });
  p.recordId = created.id;
  return created.id;
}

const invalid = (problems: { path: string; message: string }[]) =>
  refuse(
    400,
    "VALIDATION",
    problems[0]?.message ?? "Some of the fields are not valid.",
    problems.map((p) => ({ path: `body.${p.path}`, message: p.message })),
  );

async function lockedByOther(tx: Tx, tenantId: string, entryId: string, actor: string, now: Date): Promise<string | null> {
  const lock = await tx.progressLock.findFirst({ where: { tenantId, entryId } });
  if (!lockActive(lock, now) || lock.holderUserId === actor) return null;
  return (await namesOf(tx, tenantId, [lock.holderUserId])).get(lock.holderUserId) ?? "Someone";
}

type Planned = { ok: true; run: () => Promise<{ id: string }> } | { ok: false; failure: ReturnType<typeof refuse> };
const fail = (failure: ReturnType<typeof refuse>): Planned => ({ ok: false, failure });

type RowIn = { id?: string; trackKey: string; entryDate: string; values: unknown; version?: number };

/// Plans one row (a new entry or a change of one) WITHOUT writing anything; `run` writes it. A week of rows is planned in full first, so a refusal on the fifth row writes none.
async function planRow(p: Prepared, row: RowIn, submit: boolean, now: Date): Promise<Planned> {
  const { tenantId } = p;
  const track = trackOf(p.template.schema, row.trackKey);
  if (!track)
    return fail(
      refuse(400, "UNKNOWN_TRACK", "That part of the record doesn't exist.", [
        { path: "body.trackKey", message: "That part of the record doesn't exist." },
      ]),
    );
  const parsed = parseValues(track, p.template.schema, row.values);
  if (!parsed.ok) return fail(invalid(parsed.problems));
  const { settings } = p;
  if (!row.id) {
    const problem = entryDayProblem(row.entryDate, p.day, p.joinedOn);
    if (problem) return fail(refuse(400, "VALIDATION", problem, [{ path: "body.entryDate", message: problem }]));
    if (track.oneRowPerDay && p.recordId) {
      const existing = await p.tx.progressEntry.findFirst({
        where: { tenantId, recordId: p.recordId, trackKey: track.key, entryDate: asDate(row.entryDate) },
        select: { id: true },
      });
      if (existing)
        return fail(
          refuse(409, "EXISTS", `There is already an entry for ${track.label.en} on ${row.entryDate}. Open it to change it.`, [
            { path: "entryId", message: existing.id },
          ]),
        );
    }
    const status = statusAfterSave(null, { requireVerification: settings.requireVerification, submit });
    return {
      ok: true,
      run: async () => {
        const recordId = await ensureRecord(p);
        const published = status === "VERIFIED";
        const created = await p.tx.progressEntry.create({
          data: {
            tenantId,
            programId: p.program.id,
            recordId,
            trackKey: track.key,
            entryDate: asDate(row.entryDate),
            values: parsed.values as Prisma.InputJsonValue,
            status,
            createdByUserId: p.actor,
            lastEditedByUserId: p.actor,
            submittedAt: status === "SUBMITTED" ? now : null,
            verifiedByUserId: published ? p.actor : null,
            verifiedAt: published ? now : null,
            publishedValues: published ? (parsed.values as Prisma.InputJsonValue) : undefined,
            publishedAt: published ? now : null,
          },
          select: { id: true },
        });
        await revise(p, { entryId: created.id, recordId, version: 1, action: "CREATE", before: null, after: parsed.values, status });
        return created;
      },
    };
  }
  const entry = await p.tx.progressEntry.findFirst({
    where: { tenantId, id: row.id, programId: p.program.id, record: { participantId: p.person.id } },
  });
  if (!entry) return fail(refuse(404, "NOT_FOUND", ENTRY_NOT_FOUND));
  if (row.version !== entry.version) return fail(await changedElsewhere(p.tx, p.tenantId, entry));
  const holder = await lockedByOther(p.tx, p.tenantId, entry.id, p.actor, now);
  if (holder)
    return fail(refuse(409, "LOCKED", `${holder} is editing this entry. You can read it, and change it once they have finished.`));
  const status = statusAfterSave(entry.status, { requireVerification: settings.requireVerification, submit });
  const same = sameJson(entry.values, parsed.values);
  if (same && status === entry.status) return { ok: true, run: async () => ({ id: entry.id }) };
  return {
    ok: true,
    run: async () => {
      const published = status === "VERIFIED";
      await p.tx.progressEntry.update({
        where: { tenantId, id: entry.id },
        data: {
          values: parsed.values as Prisma.InputJsonValue,
          status,
          version: entry.version + 1,
          lastEditedByUserId: p.actor,
          submittedAt: status === "SUBMITTED" ? now : entry.submittedAt,
          returnComment: null,
          ...(published
            ? { verifiedByUserId: p.actor, verifiedAt: now, publishedValues: parsed.values as Prisma.InputJsonValue, publishedAt: now }
            : {}),
        },
      });
      await revise(p, {
        entryId: entry.id,
        recordId: entry.recordId,
        version: entry.version + 1,
        action: "UPDATE",
        before: entry.values as Values,
        after: parsed.values,
        status,
        note: status !== entry.status ? `${entry.status} to ${status}` : null,
      });
      return { id: entry.id };
    },
  };
}

async function changedElsewhere(tx: Tx, tenantId: string, entry: { lastEditedByUserId: string; updatedAt: Date; version: number }) {
  const who = (await namesOf(tx, tenantId, [entry.lastEditedByUserId])).get(entry.lastEditedByUserId) ?? "Someone";
  const at = entry.updatedAt.toISOString().slice(11, 16);
  return refuse(409, "CHANGED", `Changed by ${who} at ${at} (UTC). Reload to see their version.`, [
    { path: "version", message: String(entry.version) },
  ]);
}

async function revise(
  p: Prepared,
  input: {
    entryId: string;
    recordId: string;
    version: number;
    action: string;
    before: Values | null;
    after: Values | null;
    status: string;
    note?: string | null;
  },
) {
  const tenantId = p.tenantId;
  await p.tx.progressEntryRevision.create({
    data: {
      tenantId,
      programId: p.program.id,
      entryId: input.entryId,
      recordId: input.recordId,
      version: input.version,
      action: input.action,
      userId: p.actor,
      beforeValues: input.before === null ? Prisma.DbNull : (input.before as Prisma.InputJsonValue),
      afterValues: input.after === null ? Prisma.DbNull : (input.after as Prisma.InputJsonValue),
      note: input.note ?? (input.action === "CREATE" ? input.status : null),
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Writing: entries and the week

export async function createEntry(
  auth: TenantAuthContext,
  programId: string,
  personId: string,
  input: { trackKey: string; entryDate: string; values: unknown; submit: boolean },
): Promise<Result<{ id: string }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(auth, programId, "any", async ({ tx, program, viewer }) => {
    const prepared = await prepare(tx, tenantId, program, viewer, actorUserId, personId);
    if (!prepared.ok) return prepared;
    const planned = await planRow(
      prepared.data,
      { trackKey: input.trackKey, entryDate: input.entryDate, values: input.values },
      input.submit,
      new Date(),
    );
    if (!planned.ok) return planned.failure;
    return done(await planned.run());
  });
}

export async function updateEntry(
  auth: TenantAuthContext,
  programId: string,
  personId: string,
  entryId: string,
  input: { values: unknown; version: number; submit: boolean },
): Promise<Result<{ id: string }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(auth, programId, "any", async ({ tx, program, viewer }) => {
    const prepared = await prepare(tx, tenantId, program, viewer, actorUserId, personId);
    if (!prepared.ok) return prepared;
    const entry = await tx.progressEntry.findFirst({
      where: { tenantId, id: entryId, programId, record: { participantId: personId } },
      select: { trackKey: true, entryDate: true },
    });
    if (!entry) return refuse(404, "NOT_FOUND", ENTRY_NOT_FOUND);
    const planned = await planRow(
      prepared.data,
      { id: entryId, trackKey: entry.trackKey, entryDate: toIsoDate(entry.entryDate), values: input.values, version: input.version },
      input.submit,
      new Date(),
    );
    if (!planned.ok) return planned.failure;
    return done(await planned.run());
  });
}

/// Up to 30 rows of one person - the week grid mirroring the paper booklet - all or nothing.
export async function saveWeek(
  auth: TenantAuthContext,
  programId: string,
  personId: string,
  input: { rows: RowIn[]; submit: boolean },
): Promise<Result<{ saved: number; ids: string[] }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(auth, programId, "any", async ({ tx, program, viewer }) => {
    const prepared = await prepare(tx, tenantId, program, viewer, actorUserId, personId);
    if (!prepared.ok) return prepared;
    const p = prepared.data;
    const now = new Date();
    const seen = new Set<string>();
    for (const row of input.rows) {
      const track = trackOf(p.template.schema, row.trackKey);
      if (!row.id && track?.oneRowPerDay) {
        const key = `${row.trackKey}|${row.entryDate}`;
        if (seen.has(key))
          return refuse(400, "VALIDATION", `${row.entryDate} appears twice for ${track.label.en}.`, [
            { path: "body.rows", message: `${row.entryDate} appears twice.` },
          ]);
        seen.add(key);
      }
    }
    const plans: Planned[] = [];
    for (const row of input.rows) {
      const planned = await planRow(p, row, input.submit, now);
      if (!planned.ok) return planned.failure;
      plans.push(planned);
    }
    const ids: string[] = [];
    for (const planned of plans) ids.push((await (planned as Extract<Planned, { ok: true }>).run()).id);
    return done({ saved: ids.length, ids });
  });
}

export async function saveProfile(
  auth: TenantAuthContext,
  programId: string,
  personId: string,
  input: { values: unknown; version?: number },
): Promise<Result<{ version: number }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(auth, programId, "any", async ({ tx, program, viewer }) => {
    const prepared = await prepare(tx, tenantId, program, viewer, actorUserId, personId);
    if (!prepared.ok) return prepared;
    const p = prepared.data;
    const parsed = parseProfile(p.template.schema, input.values);
    if (!parsed.ok) return invalid(parsed.problems);
    const current = p.recordId ? await tx.progressRecord.findUnique({ where: { tenantId, id: p.recordId } }) : null;
    if (current && (input.version ?? current.version) !== current.version) {
      const message = "The profile was changed by someone else. Reload to see it.";
      return refuse(409, "CHANGED", message, [{ path: "version", message: String(current.version) }]);
    }
    if (current && sameJson(current.profile, parsed.profile)) return done({ version: current.version });
    const recordId = await ensureRecord(p);
    const updated = await tx.progressRecord.update({
      where: { tenantId, id: recordId },
      data: { profile: parsed.profile as Prisma.InputJsonValue, version: { increment: 1 } },
      select: { version: true },
    });
    await writeAudit(tx, tenantId, {
      programId,
      actorUserId,
      action: "PROGRESS_PROFILE_CHANGED",
      targetType: "ProgramParticipant",
      targetId: personId,
      before: (current?.profile ?? {}) as Prisma.InputJsonValue,
      after: parsed.profile as Prisma.InputJsonValue,
    });
    return done({ version: updated.version });
  });
}

export type RevisionView = {
  id: string;
  version: number;
  action: string;
  by: string;
  at: string;
  before: Values | null;
  after: Values | null;
  note: string | null;
};

export async function entryRevisions(
  auth: TenantAuthContext,
  programId: string,
  personId: string,
  entryId: string,
): Promise<Result<RevisionView[]>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return reading(auth, programId, async ({ tx, viewer }) => {
    const program = await tx.program.findUnique({ where: { tenantId, id: programId }, select: { progressWriters: true } });
    if (!program) return refuse(404, "NOT_FOUND", NOT_FOUND);
    const access = await progressAccessOf(tx, tenantId, actorUserId, programId, viewer, program.progressWriters);
    const [person] = await rollPeople(tx, { tenantId, id: personId, programId, AND: [reachOfAccess(access.read)] }, today());
    if (!person) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
    const entry = await tx.progressEntry.findFirst({
      where: { tenantId, id: entryId, programId, record: { participantId: personId } },
      select: { id: true },
    });
    if (!entry) return refuse(404, "NOT_FOUND", ENTRY_NOT_FOUND);
    const rows = await tx.progressEntryRevision.findMany({
      where: { tenantId, entryId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 200,
    });
    const names = await namesOf(
      tx,
      tenantId,
      rows.map((row) => row.userId),
    );
    return done(
      rows.map((row) => ({
        id: row.id,
        version: row.version,
        action: row.action,
        by: names.get(row.userId) ?? "A person who has left",
        at: row.createdAt.toISOString(),
        before: row.beforeValues as Values | null,
        after: row.afterValues as Values | null,
        note: row.note,
      })),
    );
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Slice R2: verification

type VerifyAction =
  { action: "verify"; version: number } | { action: "return"; version: number; comment: string } | { action: "submit"; version: number };

async function verifyPrelude(
  tx: Tx,
  tenantId: string,
  program: Program,
  viewer: ProgramViewer,
  actor: string,
  personId: string,
): Promise<Result<{ settings: ProgressSettings; access: ProgressAccess; person: PersonRow }>> {
  const settings = progressSettingsOf(program);
  const access = await progressAccessOf(tx, tenantId, actor, program.id, viewer, program.progressWriters);
  const [person] = await rollPeople(tx, { tenantId, id: personId, programId: program.id, AND: [reachOfAccess(access.read)] }, today());
  if (!person) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
  const state = await progressStateOf(tx, tenantId, program.id, program.progressEnabled);
  if (!state.on) return refuse(409, "PROGRESS_OFF", OFF_MESSAGE);
  return done({ settings, access, person });
}

/// verify: confirm a submitted entry (an administrator or a supervisor, never the person who last edited it while four-eyes is on). return: send it back to its writer with a comment.
/// submit: the writer says a draft is done. Each needs the version the screen saw.
export async function entryAction(
  auth: TenantAuthContext,
  programId: string,
  personId: string,
  entryId: string,
  input: VerifyAction,
): Promise<Result<{ id: string; status: EntryStatus }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change<{ id: string; status: EntryStatus }>(auth, programId, "any", async ({ tx, program, viewer }) => {
    const pre = await verifyPrelude(tx, tenantId, program, viewer, actorUserId, personId);
    if (!pre.ok) return pre;
    const { settings, access, person } = pre.data;
    const entry = await tx.progressEntry.findFirst({ where: { tenantId, id: entryId, programId, record: { participantId: personId } } });
    if (!entry) return refuse(404, "NOT_FOUND", ENTRY_NOT_FOUND);
    if (entry.version !== input.version) return await changedElsewhere(tx, tenantId, entry);
    const now = new Date();
    const holder = await lockedByOther(tx, tenantId, entry.id, actorUserId, now);
    if (holder) return refuse(409, "LOCKED", `${holder} is editing this entry.`);
    const revision = (action: string, note: string | null) =>
      tx.progressEntryRevision.create({
        data: {
          tenantId,
          programId,
          entryId: entry.id,
          recordId: entry.recordId,
          version: entry.version + 1,
          action,
          userId: actorUserId,
          note,
          beforeValues: Prisma.DbNull,
          afterValues: Prisma.DbNull,
        },
      });
    if (input.action === "submit") {
      if (!settings.requireVerification || entry.status !== "DRAFT")
        return refuse(409, "NOT_APPLICABLE", "Only a draft can be handed in for verification.");
      if (!canWrite(access, person.groupId, person.state))
        return refuse(403, "FORBIDDEN", "You are not named to write to this person's group.");
      await tx.progressEntry.update({
        where: { tenantId, id: entry.id },
        data: { status: "SUBMITTED", submittedAt: now, version: { increment: 1 }, lastEditedByUserId: actorUserId, returnComment: null },
      });
      await revision("SUBMIT", null);
      return done({ id: entry.id, status: "SUBMITTED" as const });
    }
    if (entry.status !== "SUBMITTED")
      return refuse(409, "NOT_APPLICABLE", "Only an entry that has been handed in can be verified or returned.");
    if (!canVerifyAtAll(access)) return refuse(403, "FORBIDDEN", "Only an administrator or a supervisor can verify.");
    if (!mayVerify({ admin: access.admin, supervisor: access.supervisor, userId: actorUserId }, entry, settings.fourEyes))
      return refuse(403, "FOUR_EYES", "Someone else has to verify an entry you wrote or last changed.");
    if (input.action === "return") {
      await tx.progressEntry.update({
        where: { tenantId, id: entry.id },
        data: { status: "DRAFT", returnComment: input.comment, version: { increment: 1 } },
      });
      await revision("RETURN", input.comment);
      return done({ id: entry.id, status: "DRAFT" as const });
    }
    await tx.progressEntry.update({
      where: { tenantId, id: entry.id },
      data: {
        status: "VERIFIED",
        version: { increment: 1 },
        verifiedByUserId: actorUserId,
        verifiedAt: now,
        returnComment: null,
        publishedValues: entry.values as Prisma.InputJsonValue,
        publishedAt: now,
      },
    });
    await revision("VERIFY", null);
    return done({ id: entry.id, status: "VERIFIED" as const });
  });
}

/// "Verify the week": every submitted entry of one person in one week, in one step. All or nothing: if one of them is the verifier's own, none is verified.
export async function verifyWeek(
  auth: TenantAuthContext,
  programId: string,
  personId: string,
  weekStart: string,
): Promise<Result<{ verified: number }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(auth, programId, "any", async ({ tx, program, viewer }) => {
    const pre = await verifyPrelude(tx, tenantId, program, viewer, actorUserId, personId);
    if (!pre.ok) return pre;
    const { settings, access } = pre.data;
    if (!canVerifyAtAll(access)) return refuse(403, "FORBIDDEN", "Only an administrator or a supervisor can verify.");
    const template = await templateOf(tx, tenantId, program);
    if (!template) return refuse(409, "NOT_STARTED", NOT_STARTED);
    const start = weekStartOf(weekStart, template.schema.weekStart);
    const entries = await tx.progressEntry.findMany({
      where: {
        tenantId,
        programId,
        record: { participantId: personId },
        status: "SUBMITTED",
        entryDate: { gte: asDate(start), lte: asDate(addDays(start, 6)) },
      },
    });
    if (entries.length === 0) return refuse(409, "NOTHING_TO_VERIFY", "There is nothing handed in for that week.");
    const own = entries.filter(
      (entry) => !mayVerify({ admin: access.admin, supervisor: access.supervisor, userId: actorUserId }, entry, settings.fourEyes),
    );
    if (own.length > 0)
      return refuse(
        403,
        "FOUR_EYES",
        `${own.length} of these entries were written or last changed by you. Someone else has to verify them, so none was verified.`,
      );
    const now = new Date();
    const names = new Set<string>();
    for (const entry of entries) {
      const holder = await lockedByOther(tx, tenantId, entry.id, actorUserId, now);
      if (holder) names.add(holder);
    }
    if (names.size > 0) return refuse(409, "LOCKED", `${[...names].join(", ")} is editing one of these entries, so none was verified.`);
    for (const entry of entries) {
      await tx.progressEntry.update({
        where: { tenantId, id: entry.id },
        data: {
          status: "VERIFIED",
          version: { increment: 1 },
          verifiedByUserId: actorUserId,
          verifiedAt: now,
          returnComment: null,
          publishedValues: entry.values as Prisma.InputJsonValue,
          publishedAt: now,
        },
      });
      await tx.progressEntryRevision.create({
        data: {
          tenantId,
          programId,
          entryId: entry.id,
          recordId: entry.recordId,
          version: entry.version + 1,
          action: "VERIFY",
          userId: actorUserId,
          note: `week of ${start}`,
          beforeValues: Prisma.DbNull,
          afterValues: Prisma.DbNull,
        },
      });
    }
    return done({ verified: entries.length });
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Slice R2: the lock on an entry

export type LockAnswer = { held: boolean; mine: boolean; holder: string | null; expiresAt: string | null; releasing: boolean };

/// take / heartbeat: hold the entry for this person (or keep holding it) for the program's inactivity time. viewing: hand it back after the program's short delay (at once when the delay is 0).
/// release: an administrator or the holder, at once. Advisory against a stale page: the version check on a save is the safety net.
export async function lockAction(
  auth: TenantAuthContext,
  programId: string,
  personId: string,
  entryId: string,
  action: "take" | "heartbeat" | "viewing" | "release",
): Promise<Result<LockAnswer>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(auth, programId, "any", async ({ tx, program, viewer }) => {
    const settings = progressSettingsOf(program);
    const access = await progressAccessOf(tx, tenantId, actorUserId, programId, viewer, program.progressWriters);
    const [person] = await rollPeople(tx, { tenantId, id: personId, programId, AND: [reachOfAccess(access.read)] }, today());
    if (!person) return refuse(404, "NOT_FOUND", PERSON_NOT_FOUND);
    const entry = await tx.progressEntry.findFirst({
      where: { tenantId, id: entryId, programId, record: { participantId: personId } },
      select: { id: true },
    });
    if (!entry) return refuse(404, "NOT_FOUND", ENTRY_NOT_FOUND);
    const now = new Date();
    const lock = await tx.progressLock.findFirst({ where: { tenantId, entryId } });
    const live = lockActive(lock, now);
    const answer = async (row: typeof lock): Promise<LockAnswer> => {
      if (!lockActive(row, now) || !row) return { held: false, mine: false, holder: null, expiresAt: null, releasing: false };
      const holder = (await namesOf(tx, tenantId, [row.holderUserId])).get(row.holderUserId) ?? "Someone";
      return {
        held: true,
        mine: row.holderUserId === actorUserId,
        holder,
        expiresAt: row.expiresAt.toISOString(),
        releasing: row.releaseAt !== null,
      };
    };
    if (action === "release" || action === "viewing") {
      if (!live) return done(await answer(null));
      const mine = lock.holderUserId === actorUserId;
      if (!mine && !access.admin)
        return refuse(403, "FORBIDDEN", "Only the person editing it, or an administrator, can hand this entry back.");
      if (action === "release" || settings.lockRelease === 0 || !mine) {
        await tx.progressLock.delete({ where: { tenantId, entryId } });
        return done(await answer(null));
      }
      const updated = await tx.progressLock.update({
        where: { tenantId, entryId },
        data: { releaseAt: new Date(now.getTime() + settings.lockRelease * 1000) },
      });
      return done(await answer(updated));
    }
    // take / heartbeat
    const state = await progressStateOf(tx, tenantId, programId, program.progressEnabled);
    if (!state.on) return refuse(409, "PROGRESS_OFF", OFF_MESSAGE);
    if (!canWrite(access, person.groupId, person.state)) return refuse(403, "FORBIDDEN", "You can't edit this entry.");
    if (live && lock.holderUserId !== actorUserId) {
      const holder = (await namesOf(tx, tenantId, [lock.holderUserId])).get(lock.holderUserId) ?? "Someone";
      return refuse(409, "LOCKED", `${holder} is editing this entry. You can read it, and change it once they have finished.`);
    }
    const data = { holderUserId: actorUserId, heartbeatAt: now, expiresAt: lockExpiry(now, settings.lockInactivity), releaseAt: null };
    const saved = await tx.progressLock.upsert({
      where: { tenantId, entryId },
      create: { tenantId, entryId, programId, ...data },
      update: data,
    });
    return done(await answer(saved));
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The week grid's days (for a screen that wants them without loading the whole record)

export { weekDates };
export { isPresetKey };
export type { ErrorDetail };
