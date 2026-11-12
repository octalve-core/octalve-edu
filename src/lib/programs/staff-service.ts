import { ProgramStaffRole, ProgramStaffStatus } from "@prisma/client";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import type { Tx } from "@/lib/tenant/for-tenant";
import { STAFF_ROLES, placeFits, viewerOf } from "./access";
import { NOT_FOUND, change, done, refuse, writeAudit, type Result } from "./common";

// Programs: the people who run a program (slice P1 names program admins only; slice P3 adds supervisors, teachers and recorders). Only the school's administrator names or ends a program
// admin, so nobody can promote themselves; the person must hold an active staff membership whose campus is empty or one the program runs in, and the authority is read from that membership at
// every request (access.ts).

export const GROUP_ROLES: readonly ProgramStaffRole[] = [ProgramStaffRole.TEACHER, ProgramStaffRole.RECORDER];
const ROLE_TEXT: Record<ProgramStaffRole, string> = {
  ADMIN: "run this program",
  SUPERVISOR: "supervise this program",
  TEACHER: "teach in this program",
  RECORDER: "record for this program",
};

/// Names a person to a role in the program (slice P3 widened P1's "name a program admin"). Only the school's administrator names a program ADMIN, so nobody can promote themselves; the
/// school's administrator and a program admin name a SUPERVISOR (reads and corrects everything), a TEACHER or a RECORDER (take attendance for the groups they are assigned to). The person must
/// hold an active staff membership whose campus is empty or one the program runs in, and the authority is read from that membership at every request (access.ts).
export async function nameProgramStaff(
  auth: TenantAuthContext,
  programId: string,
  input: { userId: string; role: ProgramStaffRole },
): Promise<Result<{ id: string }>> {
  const { tenantId } = auth.tenant;
  const { userId, role } = input;
  return change(auth, programId, role === ProgramStaffRole.ADMIN ? "super" : "manage", async ({ tx, program }) => {
    const linked = (await tx.programCampus.findMany({ where: { tenantId, programId: program.id }, select: { campusId: true } })).map(
      (row) => row.campusId,
    );
    const membership = await tx.tenantMembership.findFirst({
      where: { tenantId, userId, deactivatedAt: null, role: { in: [...STAFF_ROLES] } },
      select: { campusId: true, user: { select: { name: true, email: true } } },
    });
    if (!membership || !placeFits(linked, membership.campusId))
      return refuse(400, "VALIDATION", "That person is not a member of staff who can work in this program.", [
        { path: "body.userId", message: "That person is not a member of staff who can work in this program." },
      ]);
    const existing = await tx.programStaff.findUnique({ where: { programId_userId_role: { programId: program.id, userId, role } } });
    if (existing?.status === ProgramStaffStatus.ACTIVE)
      return refuse(409, "ALREADY", `That person already does this: they ${ROLE_TEXT[role]}.`);
    // A place that was ended and is named again starts with NO groups: an old assignment must never come back by itself (it is in the audit, if anyone wants to give it again).
    if (existing) await tx.programStaffGroup.deleteMany({ where: { tenantId, programStaffId: existing.id } });
    const place = existing
      ? await tx.programStaff.update({
          where: { tenantId_id: { tenantId, id: existing.id } },
          data: { status: ProgramStaffStatus.ACTIVE, endedAt: null, createdByUserId: auth.userId },
        })
      : await tx.programStaff.create({ data: { tenantId, programId: program.id, userId, role, createdByUserId: auth.userId } });
    await writeAudit(tx, tenantId, {
      programId: program.id,
      actorUserId: auth.userId,
      action: role === ProgramStaffRole.ADMIN ? "ADMIN_NAMED" : "STAFF_NAMED",
      targetType: "User",
      targetId: userId,
      after: { name: membership.user.name ?? membership.user.email, role },
    });
    return done({ id: place.id });
  });
}

/// Names a person a program admin (slice P1's call; the same thing as naming the ADMIN role).
export const nameProgramAdmin = (auth: TenantAuthContext, programId: string, userId: string) =>
  nameProgramStaff(auth, programId, { userId, role: ProgramStaffRole.ADMIN });

/// Ends a place in the program's staff (kept as history, with its group assignments, which stop counting at once because the place is no longer active). A program ADMIN's place is ended by
/// the school's administrator only; any other by the school's administrator or a program admin.
export async function endProgramStaff(auth: TenantAuthContext, programId: string, staffId: string): Promise<Result<{ id: string }>> {
  const { tenantId } = auth.tenant;
  return change(auth, programId, "manage", async ({ tx, program, viewer }) => {
    const place = await tx.programStaff.findFirst({
      where: { tenantId, id: staffId, programId: program.id },
      include: { membership: { select: { user: { select: { name: true, email: true } } } } },
    });
    if (!place) return refuse(404, "NOT_FOUND", "That person was not found.");
    if (place.role === ProgramStaffRole.ADMIN && viewer.level !== "SUPER")
      return refuse(403, "FORBIDDEN", "You don't have permission to do that.");
    if (place.status === ProgramStaffStatus.ENDED) return done({ id: place.id });
    await tx.programStaff.update({
      where: { tenantId_id: { tenantId, id: place.id } },
      data: { status: ProgramStaffStatus.ENDED, endedAt: new Date() },
    });
    await writeAudit(tx, tenantId, {
      programId: program.id,
      actorUserId: auth.userId,
      action: place.role === ProgramStaffRole.ADMIN ? "ADMIN_ENDED" : "STAFF_ENDED",
      targetType: "User",
      targetId: place.userId,
      before: { name: place.membership.user.name ?? place.membership.user.email, role: place.role },
    });
    return done({ id: place.id });
  });
}

export type AdminCandidate = { userId: string; name: string; email: string | null; role: string; campusName: string | null };

/// The staff the school's administrator may name a program admin: active members with a staff role whose campus fits the program, not already running it. Names and e-mail addresses are
/// the school's own staff list: the school's administrator only (the route says 403 to anyone else, 404 to a program they cannot see).
export async function adminCandidates(auth: TenantAuthContext, programId: string): Promise<Result<{ candidates: AdminCandidate[] }>> {
  const { tenantId } = auth.tenant;
  if (auth.tenant.role !== "ADMIN") return refuse(403, "FORBIDDEN", "You don't have permission to do that.");
  return auth.tenant.run(async (tx) => {
    if (!(await viewerOf(auth, tx, programId))) return refuse(404, "NOT_FOUND", NOT_FOUND);
    return done({ candidates: await listCandidates(tx, tenantId, programId, ProgramStaffRole.ADMIN) });
  });
}

async function listCandidates(tx: Tx, tenantId: string, programId: string, role: ProgramStaffRole): Promise<AdminCandidate[]> {
  const linked = (await tx.programCampus.findMany({ where: { tenantId, programId }, select: { campusId: true } })).map(
    (row) => row.campusId,
  );
  const [rows, running] = await Promise.all([
    tx.tenantMembership.findMany({
      where: { tenantId, deactivatedAt: null, role: { in: [...STAFF_ROLES] } },
      select: {
        userId: true,
        role: true,
        campusId: true,
        campus: { select: { name: true } },
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    }),
    tx.programStaff.findMany({
      where: { tenantId, programId, role, status: ProgramStaffStatus.ACTIVE },
      select: { userId: true },
    }),
  ]);
  const already = new Set(running.map((row) => row.userId));
  return rows
    .filter((row) => !already.has(row.userId) && placeFits(linked, row.campusId))
    .map((row) => ({
      userId: row.userId,
      name: row.user.name ?? row.user.email ?? "Unnamed",
      email: row.user.email,
      role: row.role,
      campusName: row.campus?.name ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const MAX_ASSIGNED_GROUPS = 200;

/// Replaces the groups a TEACHER or a RECORDER is assigned to. An assignment covers the groups inside it; a supervisor and an admin reach every group and take none.
export async function setStaffGroups(
  auth: TenantAuthContext,
  programId: string,
  staffId: string,
  groupIds: string[],
): Promise<Result<{ groupIds: string[] }>> {
  const { tenantId } = auth.tenant;
  return change(auth, programId, "manage", async ({ tx, program }) => {
    const place = await tx.programStaff.findFirst({
      where: { tenantId, id: staffId, programId: program.id, status: ProgramStaffStatus.ACTIVE },
      include: { groups: true },
    });
    if (!place) return refuse(404, "NOT_FOUND", "That person was not found.");
    if (!GROUP_ROLES.includes(place.role))
      return refuse(
        409,
        "NO_GROUPS_FOR_ROLE",
        "A supervisor and a program admin reach every group. Only a teacher or a recorder is given groups.",
      );
    const wanted = [...new Set(groupIds)];
    if (wanted.length > MAX_ASSIGNED_GROUPS) return refuse(400, "VALIDATION", `At most ${MAX_ASSIGNED_GROUPS} groups.`);
    const live = await tx.programGroup.findMany({ where: { tenantId, programId: program.id, archivedAt: null }, select: { id: true } });
    const liveIds = new Set(live.map((group) => group.id));
    // A group of another program, an archived one and an unknown one are all "not there".
    if (wanted.some((id) => !liveIds.has(id))) return refuse(404, "NOT_FOUND", "That group was not found.");
    const before = place.groups.map((row) => row.groupId).sort();
    const after = [...wanted].sort();
    if (before.length === after.length && before.every((id, i) => id === after[i])) return done({ groupIds: after });
    await tx.programStaffGroup.deleteMany({ where: { tenantId, programStaffId: place.id, groupId: { notIn: wanted } } });
    const have = new Set(before);
    const fresh = wanted.filter((id) => !have.has(id));
    if (fresh.length > 0)
      await tx.programStaffGroup.createMany({
        data: fresh.map((groupId) => ({
          tenantId,
          programId: program.id,
          programStaffId: place.id,
          groupId,
          createdByUserId: auth.userId,
        })),
      });
    await writeAudit(tx, tenantId, {
      programId: program.id,
      actorUserId: auth.userId,
      action: "STAFF_GROUPS_CHANGED",
      targetType: "User",
      targetId: place.userId,
      before: { role: place.role, groupIds: before },
      after: { role: place.role, groupIds: after },
    });
    return done({ groupIds: after });
  });
}

/// Who could be named to `role`: the active staff whose campus fits the program, minus those who already hold that role. A program ADMIN is named by the school's administrator only, so only
/// the school's administrator sees candidates for it; the other roles are named by the school's administrator or a program admin.
export async function candidatesFor(
  auth: TenantAuthContext,
  programId: string,
  role: ProgramStaffRole = ProgramStaffRole.ADMIN,
): Promise<Result<{ candidates: AdminCandidate[] }>> {
  const { tenantId } = auth.tenant;
  return auth.tenant.run(async (tx): Promise<Result<{ candidates: AdminCandidate[] }>> => {
    const viewer = await viewerOf(auth, tx, programId);
    if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
    if (role === ProgramStaffRole.ADMIN ? viewer.level !== "SUPER" : viewer.level !== "SUPER" && viewer.level !== "ADMIN")
      return refuse(403, "FORBIDDEN", "You don't have permission to do that.");
    return done({ candidates: await listCandidates(tx, tenantId, programId, role) });
  });
}
