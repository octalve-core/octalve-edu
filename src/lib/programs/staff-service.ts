import { ProgramStaffRole, ProgramStaffStatus } from "@prisma/client";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import { STAFF_ROLES, placeFits, viewerOf } from "./access";
import { NOT_FOUND, change, done, refuse, writeAudit, type Result } from "./common";

// Programs: the people who run a program (slice P1 names program admins only; slice P3 adds supervisors, teachers and recorders). Only the school's administrator names or ends a program
// admin, so nobody can promote themselves; the person must hold an active staff membership whose campus is empty or one the program runs in, and the authority is read from that membership at
// every request (access.ts).

const SAME_AS_ADMIN = { role: ProgramStaffRole.ADMIN } as const;

/// Names a person a program admin.
export async function nameProgramAdmin(auth: TenantAuthContext, programId: string, userId: string): Promise<Result<{ id: string }>> {
  const { tenantId } = auth.tenant;
  return change(auth, programId, "super", async ({ tx, program }) => {
    const linked = (await tx.programCampus.findMany({ where: { tenantId, programId: program.id }, select: { campusId: true } })).map(
      (row) => row.campusId,
    );
    const membership = await tx.tenantMembership.findFirst({
      where: { tenantId, userId, deactivatedAt: null, role: { in: [...STAFF_ROLES] } },
      select: { campusId: true, user: { select: { name: true, email: true } } },
    });
    if (!membership || !placeFits(linked, membership.campusId))
      return refuse(400, "VALIDATION", "That person is not a member of staff who can run this program.", [
        { path: "body.userId", message: "That person is not a member of staff who can run this program." },
      ]);
    const existing = await tx.programStaff.findUnique({
      where: { programId_userId_role: { programId: program.id, userId, ...SAME_AS_ADMIN } },
    });
    if (existing?.status === ProgramStaffStatus.ACTIVE) return refuse(409, "ALREADY", "That person already runs this program.");
    const place = existing
      ? await tx.programStaff.update({
          where: { tenantId_id: { tenantId, id: existing.id } },
          data: { status: ProgramStaffStatus.ACTIVE, endedAt: null, createdByUserId: auth.userId },
        })
      : await tx.programStaff.create({
          data: { tenantId, programId: program.id, userId, role: ProgramStaffRole.ADMIN, createdByUserId: auth.userId },
        });
    await writeAudit(tx, tenantId, {
      programId: program.id,
      actorUserId: auth.userId,
      action: "ADMIN_NAMED",
      targetType: "User",
      targetId: userId,
      after: { name: membership.user.name ?? membership.user.email, role: "ADMIN" },
    });
    return done({ id: place.id });
  });
}

/// Ends a place in the program's staff (kept as history). A program ADMIN's place is ended by the school's administrator only.
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
      action: "ADMIN_ENDED",
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
        where: { tenantId, programId, role: ProgramStaffRole.ADMIN, status: ProgramStaffStatus.ACTIVE },
        select: { userId: true },
      }),
    ]);
    const already = new Set(running.map((row) => row.userId));
    return done({
      candidates: rows
        .filter((row) => !already.has(row.userId) && placeFits(linked, row.campusId))
        .map((row) => ({
          userId: row.userId,
          name: row.user.name ?? row.user.email ?? "Unnamed",
          email: row.user.email,
          role: row.role,
          campusName: row.campus?.name ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  });
}
