import { Permission, Prisma } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import { cleanSectionName, normaliseScopeSet, sameCampus, scopeKey, type ScopeEntry } from "./section-rules";

// Sections and approver scopes: the administrator's side of ADR 0018. What a scope MEANS (which results a person sees and may approve) lives in approver-scope.ts; this file
// is how the school's administrator sets them up: create, rename, reorder and archive sections, place class groups in them, and say where each approver approves.
//
// Every function runs in ONE transaction through `tenant.run`, names the school in its queries even though row-level security is the net underneath, and writes its audit row
// in the SAME transaction as the change. Nothing is deleted except a person's scope rows, which are replaced as a set (the table has no UPDATE policy on purpose). The caller
// (the route) has already checked that this is the school's ADMIN and has verified the step-up proof.

type TenantCtx = TenantAuthContext["tenant"];

export type ApproverSettingsFailure =
  | "NOT_FOUND"
  | "INVALID_NAME"
  | "INVALID_CAMPUS"
  | "NAME_TAKEN"
  | "ARCHIVED"
  | "CAMPUS_MISMATCH"
  | "NOT_AN_APPROVER"
  | "GENERAL_WITH_OTHERS";

type What = "section" | "class group" | "person" | "campus";
export type ApproverSettingsResult<T> = ({ ok: true } & T) | { ok: false; reason: ApproverSettingsFailure; what?: What };

const refuse = (reason: ApproverSettingsFailure, what?: What): { ok: false; reason: ApproverSettingsFailure; what?: What } => ({
  ok: false,
  reason,
  ...(what ? { what } : {}),
});

export type SectionView = {
  id: string;
  name: string;
  campusId: string | null;
  campusName: string | null;
  sortOrder: number;
  archived: boolean;
  classGroups: ClassGroupView[];
};
export type ClassGroupView = { id: string; name: string; campusId: string | null; sectionId: string | null };
export type ApproverView = {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  campusId: string | null;
  campusName: string | null;
  scopes: ScopeView[];
};
export type ScopeView = {
  kind: "GENERAL" | "SECTION" | "CLASS";
  sectionId: string | null;
  sectionName: string | null;
  classGroupId: string | null;
  classGroupName: string | null;
};

const CLASS_GROUP_SELECT = { id: true, name: true, campusId: true, sectionId: true } satisfies Prisma.ClassGroupSelect;

const audit = (
  tx: Tx,
  tenantId: string,
  actorUserId: string,
  action: string,
  targetType: string,
  targetId: string,
  beforeValue: Prisma.InputJsonValue | undefined,
  afterValue: Prisma.InputJsonValue | undefined,
) =>
  tx.auditLog.create({
    data: {
      tenantId,
      actorUserId,
      action,
      targetType,
      targetId,
      ...(beforeValue !== undefined ? { beforeValue } : {}),
      ...(afterValue !== undefined ? { afterValue } : {}),
    },
  });

/// The database holds one LIVE section name per campus, compared without regard to case (a partial unique index). A violation of it is "that name is taken", whatever won the race.
const isNameTaken = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

// --- Reading ------------------------------------------------------------------------------------------------------------------------------------------------

/// Every section (archived ones marked, last), the class groups in each, and the class groups that are in none. The campuses are listed so a screen can offer them.
export async function listSections(tenant: TenantCtx) {
  const { tenantId } = tenant;
  return tenant.run(async (tx) => {
    const [sections, unplaced, campuses] = await Promise.all([
      tx.section.findMany({
        where: { tenantId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
        include: {
          campus: { select: { name: true } },
          classGroups: {
            where: { tenantId, archivedAt: null },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            select: CLASS_GROUP_SELECT,
          },
        },
      }),
      tx.classGroup.findMany({
        where: { tenantId, sectionId: null, archivedAt: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: CLASS_GROUP_SELECT,
      }),
      tx.campus.findMany({ where: { tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);
    const views: SectionView[] = sections.map((row) => ({
      id: row.id,
      name: row.name,
      campusId: row.campusId,
      campusName: row.campus?.name ?? null,
      sortOrder: row.sortOrder,
      archived: row.archivedAt !== null,
      classGroups: row.classGroups,
    }));
    // live sections first, archived ones last, each in the administrator's order
    views.sort((a, b) => Number(a.archived) - Number(b.archived));
    return { sections: views, unplacedClassGroups: unplaced, campuses };
  });
}

/// Everyone who holds CAN_APPROVE_RESULTS and is an active member, with where they approve. A person with the permission and no scope is listed with an empty list: they
/// approve nothing (fail closed), and the screen can say so.
export async function listApprovers(tenant: TenantCtx): Promise<{ approvers: ApproverView[] }> {
  const { tenantId } = tenant;
  return tenant.run(async (tx) => {
    const members = await tx.tenantMembership.findMany({
      where: { tenantId, deactivatedAt: null, permissions: { has: Permission.CAN_APPROVE_RESULTS } },
      select: {
        userId: true,
        role: true,
        campusId: true,
        user: { select: { name: true, email: true } },
        campus: { select: { name: true } },
      },
      orderBy: [{ user: { name: "asc" } }, { user: { email: "asc" } }, { id: "asc" }],
    });
    const rows = await tx.resultApprovalScope.findMany({
      where: { tenantId, userId: { in: members.map((member) => member.userId) } },
      include: { section: { select: { name: true } }, classGroup: { select: { name: true } } },
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    const byUser = new Map<string, ScopeView[]>();
    for (const row of rows) {
      const list = byUser.get(row.userId) ?? [];
      list.push({
        kind: row.kind,
        sectionId: row.sectionId,
        sectionName: row.section?.name ?? null,
        classGroupId: row.classGroupId,
        classGroupName: row.classGroup?.name ?? null,
      });
      byUser.set(row.userId, list);
    }
    return {
      approvers: members.map((member) => ({
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        role: member.role,
        campusId: member.campusId,
        campusName: member.campus?.name ?? null,
        scopes: byUser.get(member.userId) ?? [],
      })),
    };
  });
}

// --- Sections -----------------------------------------------------------------------------------------------------------------------------------------------

export async function createSection(
  tenant: TenantCtx,
  actorUserId: string,
  input: { name: unknown; campusId?: string | null; sortOrder?: number },
): Promise<ApproverSettingsResult<{ section: { id: string; name: string; campusId: string | null; sortOrder: number } }>> {
  const name = cleanSectionName(input.name);
  if (!name) return refuse("INVALID_NAME");
  const campusId = input.campusId ?? null;
  const sortOrder = input.sortOrder ?? 0;
  const { tenantId } = tenant;
  try {
    return await tenant.run(async (tx) => {
      if (campusId) {
        // a campus of ANOTHER school is, to this one, a campus that does not exist
        const campus = await tx.campus.findFirst({ where: { id: campusId, tenantId }, select: { id: true } });
        if (!campus) return refuse("INVALID_CAMPUS", "campus");
      }
      const created = await tx.section.create({
        data: { tenantId, campusId, name, sortOrder },
        select: { id: true, name: true, campusId: true, sortOrder: true },
      });
      await audit(tx, tenantId, actorUserId, "SECTION_CREATED", "Section", created.id, undefined, { name, campusId, sortOrder });
      return { ok: true as const, section: created };
    });
  } catch (error) {
    if (isNameTaken(error)) return refuse("NAME_TAKEN");
    throw error;
  }
}

/// Rename, reorder, archive or restore. An archived section can only be restored (its name and order stay as they were): archiving ends what the section granted, and
/// the scopes that name it stay on record but cover nothing until it is restored. Restoring into a name another live section now holds is "name taken".
export async function updateSection(
  tenant: TenantCtx,
  actorUserId: string,
  id: string,
  patch: { name?: unknown; sortOrder?: number; archived?: boolean },
): Promise<
  ApproverSettingsResult<{
    changed: boolean;
    section: { id: string; name: string; campusId: string | null; sortOrder: number; archived: boolean };
  }>
> {
  const newName = patch.name === undefined ? undefined : cleanSectionName(patch.name);
  if (newName === null) return refuse("INVALID_NAME");
  const { tenantId } = tenant;
  try {
    return await tenant.run(async (tx) => {
      const current = await tx.section.findFirst({ where: { id, tenantId } });
      if (!current) return refuse("NOT_FOUND", "section");
      const archivedNow = current.archivedAt !== null;
      if (archivedNow && patch.archived !== false) return refuse("ARCHIVED", "section");

      const data: Prisma.SectionUpdateInput = {};
      const trail: Array<[string, Prisma.InputJsonValue, Prisma.InputJsonValue]> = [];
      if (newName !== undefined && newName !== current.name) {
        data.name = newName;
        trail.push(["SECTION_RENAMED", { name: current.name }, { name: newName }]);
      }
      if (patch.sortOrder !== undefined && patch.sortOrder !== current.sortOrder) {
        data.sortOrder = patch.sortOrder;
        trail.push(["SECTION_REORDERED", { sortOrder: current.sortOrder }, { sortOrder: patch.sortOrder }]);
      }
      if (patch.archived === true && !archivedNow) {
        data.archivedAt = new Date();
        trail.push(["SECTION_ARCHIVED", { archived: false }, { archived: true }]);
      } else if (patch.archived === false && archivedNow) {
        data.archivedAt = null;
        trail.push(["SECTION_RESTORED", { archived: true }, { archived: false }]);
      }
      if (trail.length === 0) {
        return {
          ok: true as const,
          changed: false,
          section: { id, name: current.name, campusId: current.campusId, sortOrder: current.sortOrder, archived: archivedNow },
        };
      }
      const updated = await tx.section.update({ where: { id }, data });
      for (const [action, before, after] of trail) await audit(tx, tenantId, actorUserId, action, "Section", id, before, after);
      return {
        ok: true as const,
        changed: true,
        section: {
          id,
          name: updated.name,
          campusId: updated.campusId,
          sortOrder: updated.sortOrder,
          archived: updated.archivedAt !== null,
        },
      };
    });
  } catch (error) {
    if (isNameTaken(error)) return refuse("NAME_TAKEN");
    throw error;
  }
}

/// Puts a class group in a live section of the same campus, or takes it out (`sectionId` null). A class group is in at most one section (it holds one `sectionId`), so placing it
/// again moves it.
export async function placeClassGroup(
  tenant: TenantCtx,
  actorUserId: string,
  classGroupId: string,
  sectionId: string | null,
): Promise<ApproverSettingsResult<{ changed: boolean; classGroup: ClassGroupView }>> {
  const { tenantId } = tenant;
  return tenant.run(async (tx) => {
    const group = await tx.classGroup.findFirst({
      where: { id: classGroupId, tenantId },
      select: { ...CLASS_GROUP_SELECT, archivedAt: true },
    });
    if (!group) return refuse("NOT_FOUND", "class group");
    if (group.archivedAt) return refuse("ARCHIVED", "class group");
    if (sectionId !== null) {
      const section = await tx.section.findFirst({ where: { id: sectionId, tenantId }, select: { campusId: true, archivedAt: true } });
      if (!section) return refuse("NOT_FOUND", "section");
      if (section.archivedAt) return refuse("ARCHIVED", "section");
      if (!sameCampus(section.campusId, group.campusId)) return refuse("CAMPUS_MISMATCH", "section");
    }
    const view = (sectionIdNow: string | null): ClassGroupView => ({
      id: group.id,
      name: group.name,
      campusId: group.campusId,
      sectionId: sectionIdNow,
    });
    if (group.sectionId === sectionId) return { ok: true as const, changed: false, classGroup: view(sectionId) };
    await tx.classGroup.update({ where: { id: classGroupId }, data: { sectionId } });
    await audit(
      tx,
      tenantId,
      actorUserId,
      "CLASS_GROUP_SECTION_CHANGED",
      "ClassGroup",
      classGroupId,
      { sectionId: group.sectionId },
      { sectionId },
    );
    return { ok: true as const, changed: true, classGroup: view(sectionId) };
  });
}

// --- Approver scopes ----------------------------------------------------------------------------------------------------------------------------------------

const scopeJson = (entries: readonly ScopeEntry[]): Prisma.InputJsonValue =>
  entries.map((entry) =>
    entry.kind === "GENERAL"
      ? { kind: "GENERAL" }
      : entry.kind === "SECTION"
        ? { kind: "SECTION", sectionId: entry.sectionId }
        : { kind: "CLASS", classGroupId: entry.classGroupId },
  );

/// Replaces where `targetUserId` approves results with exactly `entries`. The person must be an active member who holds CAN_APPROVE_RESULTS (the permission says WHETHER,
/// the scope says WHERE). Every section and class group named must be this school's and live; a person tied to a campus can only be given sections and class groups of that
/// campus (or of none): the campus rule applies on top of any scope, so one in another campus would look like it grants something and grant nothing. An empty set is allowed
/// and means "approves nothing". A set that is the person's present set changes nothing and writes no audit row.
export async function setApproverScopes(
  tenant: TenantCtx,
  actorUserId: string,
  targetUserId: string,
  entries: readonly ScopeEntry[],
): Promise<ApproverSettingsResult<{ changed: boolean; scopes: ScopeEntry[] }>> {
  const set = normaliseScopeSet(entries);
  if (!set.ok) return refuse(set.problem);
  const wanted = set.scopes;
  const { tenantId } = tenant;
  return tenant.run(async (tx) => {
    const member = await tx.tenantMembership.findFirst({
      where: { tenantId, userId: targetUserId, deactivatedAt: null },
      select: { campusId: true, permissions: true },
    });
    if (!member) return refuse("NOT_FOUND", "person");
    if (!member.permissions.includes(Permission.CAN_APPROVE_RESULTS)) return refuse("NOT_AN_APPROVER");

    const fits = (campusId: string | null) => member.campusId === null || campusId === null || campusId === member.campusId;
    const sectionIds = wanted.flatMap((entry) => (entry.kind === "SECTION" ? [entry.sectionId] : []));
    const classGroupIds = wanted.flatMap((entry) => (entry.kind === "CLASS" ? [entry.classGroupId] : []));
    if (sectionIds.length > 0) {
      const sections = await tx.section.findMany({
        where: { tenantId, id: { in: sectionIds } },
        select: { id: true, campusId: true, archivedAt: true },
      });
      if (sections.length !== sectionIds.length) return refuse("NOT_FOUND", "section");
      if (sections.some((section) => section.archivedAt)) return refuse("ARCHIVED", "section");
      if (sections.some((section) => !fits(section.campusId))) return refuse("CAMPUS_MISMATCH", "section");
    }
    if (classGroupIds.length > 0) {
      const groups = await tx.classGroup.findMany({
        where: { tenantId, id: { in: classGroupIds } },
        select: { id: true, campusId: true, archivedAt: true },
      });
      if (groups.length !== classGroupIds.length) return refuse("NOT_FOUND", "class group");
      if (groups.some((group) => group.archivedAt)) return refuse("ARCHIVED", "class group");
      if (groups.some((group) => !fits(group.campusId))) return refuse("CAMPUS_MISMATCH", "class group");
    }

    const present = await tx.resultApprovalScope.findMany({
      where: { tenantId, userId: targetUserId },
      select: { kind: true, sectionId: true, classGroupId: true },
    });
    const presentEntries: ScopeEntry[] = present.map((row) =>
      row.kind === "GENERAL"
        ? { kind: "GENERAL" }
        : row.kind === "SECTION"
          ? { kind: "SECTION", sectionId: row.sectionId as string }
          : { kind: "CLASS", classGroupId: row.classGroupId as string },
    );
    const presentSet = normaliseScopeSet(presentEntries);
    const before = presentSet.ok ? presentSet.scopes : presentEntries;
    if (before.length === wanted.length && before.every((entry, index) => scopeKey(entry) === scopeKey(wanted[index]))) {
      return { ok: true as const, changed: false, scopes: wanted };
    }

    await tx.resultApprovalScope.deleteMany({ where: { tenantId, userId: targetUserId } });
    if (wanted.length > 0) {
      await tx.resultApprovalScope.createMany({
        data: wanted.map((entry) => ({
          tenantId,
          userId: targetUserId,
          kind: entry.kind,
          sectionId: entry.kind === "SECTION" ? entry.sectionId : null,
          classGroupId: entry.kind === "CLASS" ? entry.classGroupId : null,
          createdById: actorUserId,
        })),
      });
    }
    await audit(
      tx,
      tenantId,
      actorUserId,
      "RESULT_APPROVAL_SCOPE_CHANGED",
      "User",
      targetUserId,
      { scopes: scopeJson(before) },
      { scopes: scopeJson(wanted) },
    );
    return { ok: true as const, changed: true, scopes: wanted };
  });
}
