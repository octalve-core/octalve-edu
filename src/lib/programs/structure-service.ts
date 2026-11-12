import type { TenantAuthContext } from "@/lib/auth/with-auth";
import type { Tx } from "@/lib/tenant/for-tenant";
import { change, done, refuse, writeAudit, type Result } from "./common";
import { groupAndInner } from "./people-rules";
import { MAX_LEVELS, MAX_LIVE_GROUPS, cleanName, sameName } from "./rules";

// Programs, slice P1: the program's own level names and its tree of groups (AlEemaan's design note 8.5). Every change takes the program's lock, makes its checks, then writes.

/// Replaces the level names. A level cannot be taken away while any group is at it (live or archived: the history would lose its place); more levels (up to four) can be added.
export async function setLevelLabels(auth: TenantAuthContext, programId: string, labels: string[]): Promise<Result<{ labels: string[] }>> {
  const { tenantId } = auth.tenant;
  return change(auth, programId, "manage", async ({ tx, program }) => {
    if (labels.length > MAX_LEVELS) return refuse(400, "VALIDATION", `A program can have at most ${MAX_LEVELS} level names.`);
    const deepest = await tx.programGroup.aggregate({ where: { tenantId, programId: program.id }, _max: { levelIndex: true } });
    const inUse = (deepest._max.levelIndex ?? -1) + 1;
    if (labels.length < inUse) {
      return refuse(
        409,
        "LEVEL_IN_USE",
        `Groups already exist at level ${inUse}. Archive and remove them from the program before taking that level away.`,
        [{ path: "body.labels", message: `Level ${inUse} has groups in it.` }],
      );
    }
    const before = (
      await tx.programLevelLabel.findMany({ where: { tenantId, programId: program.id }, orderBy: { levelIndex: "asc" } })
    ).map((row) => row.name);
    if (before.length === labels.length && before.every((name, i) => name === labels[i])) return done({ labels });
    await tx.programLevelLabel.deleteMany({ where: { tenantId, programId: program.id } });
    await tx.programLevelLabel.createMany({
      data: labels.map((name, levelIndex) => ({ tenantId, programId: program.id, levelIndex, name })),
    });
    await writeAudit(tx, tenantId, {
      programId: program.id,
      actorUserId: auth.userId,
      action: "LEVELS_CHANGED",
      targetType: "Program",
      targetId: program.id,
      before,
      after: labels,
    });
    return done({ labels });
  });
}

const liveSiblings = (tx: Tx, tenantId: string, programId: string, parentId: string | null) =>
  tx.programGroup.findMany({
    where: { tenantId, programId, parentId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });

export async function createGroup(
  auth: TenantAuthContext,
  programId: string,
  input: { parentId?: string | null; name: string },
): Promise<Result<{ id: string; levelIndex: number }>> {
  const { tenantId } = auth.tenant;
  return change(auth, programId, "manage", async ({ tx, program }) => {
    const parent = input.parentId
      ? await tx.programGroup.findFirst({ where: { tenantId, id: input.parentId, programId: program.id } })
      : null;
    // A parent from another program, an unknown one and an archived one are all "not there": nothing about another program is revealed.
    if (input.parentId && (!parent || parent.archivedAt)) return refuse(404, "NOT_FOUND", "That group was not found.");
    const levelIndex = parent ? parent.levelIndex + 1 : 0;
    const labelCount = await tx.programLevelLabel.count({ where: { tenantId, programId: program.id } });
    if (levelIndex >= labelCount) {
      return refuse(409, "NO_LEVEL", "The program has no level below this one. Add a level name first.", [
        { path: "body.parentId", message: "There is no level below this group." },
      ]);
    }
    if ((await tx.programGroup.count({ where: { tenantId, programId: program.id, archivedAt: null } })) >= MAX_LIVE_GROUPS)
      return refuse(409, "TOO_MANY", `A program can have at most ${MAX_LIVE_GROUPS} groups.`);
    const siblings = await liveSiblings(tx, tenantId, program.id, parent?.id ?? null);
    if (siblings.some((sibling) => sameName(sibling.name, input.name)))
      return refuse(409, "DUPLICATE", "There is already a group with this name here.", [
        { path: "body.name", message: "There is already a group with this name here." },
      ]);
    const created = await tx.programGroup.create({
      data: {
        tenantId,
        programId: program.id,
        parentId: parent?.id ?? null,
        levelIndex,
        name: cleanName(input.name),
        sortOrder: siblings.length === 0 ? 0 : Math.max(...siblings.map((sibling) => sibling.sortOrder)) + 1,
      },
    });
    await writeAudit(tx, tenantId, {
      programId: program.id,
      actorUserId: auth.userId,
      action: "GROUP_ADDED",
      targetType: "ProgramGroup",
      targetId: created.id,
      after: { name: created.name, parentId: created.parentId, levelIndex },
    });
    return done({ id: created.id, levelIndex });
  });
}

export type GroupChange = { name: string } | { move: "up" | "down" } | { archived: boolean };

export async function updateGroup(
  auth: TenantAuthContext,
  programId: string,
  groupId: string,
  input: GroupChange,
): Promise<Result<{ id: string }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(auth, programId, "manage", async ({ tx, program }) => {
    const group = await tx.programGroup.findFirst({ where: { tenantId, id: groupId, programId: program.id } });
    if (!group) return refuse(404, "NOT_FOUND", "That group was not found.");
    const dupe = () =>
      refuse(409, "DUPLICATE", "There is already a group with this name here.", [
        { path: "body.name", message: "There is already a group with this name here." },
      ]);

    if ("name" in input) {
      const siblings = await liveSiblings(tx, tenantId, program.id, group.parentId);
      if (!group.archivedAt && siblings.some((sibling) => sibling.id !== group.id && sameName(sibling.name, input.name))) return dupe();
      if (group.name === input.name) return done({ id: group.id });
      await tx.programGroup.update({ where: { tenantId_id: { tenantId, id: group.id } }, data: { name: input.name } });
      await writeAudit(tx, tenantId, {
        programId: program.id,
        actorUserId,
        action: "GROUP_RENAMED",
        targetType: "ProgramGroup",
        targetId: group.id,
        before: { name: group.name },
        after: { name: input.name },
      });
      return done({ id: group.id });
    }

    if ("move" in input) {
      if (group.archivedAt) return refuse(409, "ARCHIVED", "An archived group can't be moved.");
      const siblings = await liveSiblings(tx, tenantId, program.id, group.parentId);
      const at = siblings.findIndex((sibling) => sibling.id === group.id);
      const to = input.move === "up" ? at - 1 : at + 1;
      if (to < 0 || to >= siblings.length) return done({ id: group.id }); // already first / last: nothing to do
      // Renumber the siblings 0..n-1 in their current order, then swap the two: no two siblings ever share a place afterwards.
      const order = siblings.map((sibling) => sibling.id);
      [order[at], order[to]] = [order[to]!, order[at]!];
      for (const [index, id] of order.entries()) {
        const current = siblings.find((sibling) => sibling.id === id)!;
        if (current.sortOrder !== index)
          await tx.programGroup.update({ where: { tenantId_id: { tenantId, id } }, data: { sortOrder: index } });
      }
      await writeAudit(tx, tenantId, {
        programId: program.id,
        actorUserId,
        action: "GROUP_MOVED",
        targetType: "ProgramGroup",
        targetId: group.id,
        before: { place: at },
        after: { place: to },
      });
      return done({ id: group.id });
    }

    if (input.archived) {
      if (group.archivedAt) return done({ id: group.id });
      const inside = await tx.programGroup.count({ where: { tenantId, programId: program.id, parentId: group.id, archivedAt: null } });
      if (inside > 0) return refuse(409, "HAS_GROUPS", "This group has groups inside it. Archive those first.");
      // A group is not archived while anyone has an open place in it or in a group inside it ("move or withdraw them first"). (From slice P3, one a teacher is assigned to is refused too.)
      const inner = groupAndInner(
        await tx.programGroup.findMany({ where: { tenantId, programId: program.id }, select: { id: true, parentId: true, name: true } }),
        group.id,
      );
      const people = await tx.programParticipant.count({
        where: { tenantId, programId: program.id, groupId: { in: inner }, status: "ACTIVE" },
      });
      if (people > 0) return refuse(409, "HAS_PEOPLE", "People are still in this group. Move or withdraw them first.");
      const staff = await tx.programStaffGroup.count({
        where: { tenantId, programId: program.id, groupId: { in: inner }, place: { status: "ACTIVE" } },
      });
      if (staff > 0) return refuse(409, "HAS_STAFF", "A teacher or a recorder is assigned to this group. Remove the assignment first.");
      await tx.programGroup.update({ where: { tenantId_id: { tenantId, id: group.id } }, data: { archivedAt: new Date() } });
      await writeAudit(tx, tenantId, {
        programId: program.id,
        actorUserId,
        action: "GROUP_ARCHIVED",
        targetType: "ProgramGroup",
        targetId: group.id,
        before: { name: group.name },
      });
      return done({ id: group.id });
    }

    if (!group.archivedAt) return done({ id: group.id });
    if (group.parentId) {
      const parent = await tx.programGroup.findFirst({ where: { tenantId, id: group.parentId } });
      if (!parent || parent.archivedAt) return refuse(409, "PARENT_ARCHIVED", "Restore the group it was inside first.");
    }
    const siblings = await liveSiblings(tx, tenantId, program.id, group.parentId);
    if (siblings.some((sibling) => sameName(sibling.name, group.name))) return dupe();
    if ((await tx.programGroup.count({ where: { tenantId, programId: program.id, archivedAt: null } })) >= MAX_LIVE_GROUPS)
      return refuse(409, "TOO_MANY", `A program can have at most ${MAX_LIVE_GROUPS} groups.`);
    await tx.programGroup.update({
      where: { tenantId_id: { tenantId, id: group.id } },
      data: { archivedAt: null, sortOrder: siblings.length === 0 ? 0 : Math.max(...siblings.map((sibling) => sibling.sortOrder)) + 1 },
    });
    await writeAudit(tx, tenantId, {
      programId: program.id,
      actorUserId,
      action: "GROUP_RESTORED",
      targetType: "ProgramGroup",
      targetId: group.id,
      after: { name: group.name },
    });
    return done({ id: group.id });
  });
}
