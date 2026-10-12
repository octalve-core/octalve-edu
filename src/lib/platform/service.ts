import type { SchoolType } from "@prisma/client";
import { forUser, setTenantContext } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";
import { hashInvitationToken, INVITATION_TTL_MS, newInvitationToken } from "@/lib/invitations/token";

// The platform surface (plan C5, ADR 0016): the schools of the whole installation, seen as identity data and four coarse counters, through the narrow `platform_*`
// SECURITY DEFINER functions. Nothing here reads or writes a school's own tables except the one atomic step in `createSchool` (the new school's
// first-administrator invitation, in the new school's context, in the same transaction that created it). There is no "act as a school" mode.
//
// The functions re-check, inside the database, that the caller is a platform administrator (`app.user_id` must name one) and write the platform's
// own audit row in the same transaction as the change. This module only translates their answers.

/// Four coarse numbers about a school - never a person or a row. They come from counters kept by triggers (`TenantStats`, migration 20261023090000)
/// and may be momentarily behind a transaction in flight.
export type SchoolCounts = { members: number; administrators: number; students: number; campuses: number };

export type PlatformSchool = {
  id: string;
  code: string;
  name: string;
  schoolType: SchoolType;
  createdAt: Date;
  suspendedAt: Date | null;
  counts: SchoolCounts;
};

export type PlatformAuditEntry = {
  id: string;
  actorUserId: string;
  action: string;
  targetTenantId: string | null;
  reason: string | null;
  createdAt: Date;
};

type SchoolRow = { id: string; code: string; name: string; school_type: SchoolType; created_at: Date; suspended_at: Date | null };
type StatsRow = { tenant_id: string; active_members: number; active_admins: number; students: number; campuses: number };
const NO_COUNTS: SchoolCounts = { members: 0, administrators: 0, students: 0, campuses: 0 };
const toSchool = (r: SchoolRow, stats: StatsRow | undefined): PlatformSchool => ({
  id: r.id,
  code: r.code,
  name: r.name,
  schoolType: r.school_type,
  createdAt: r.created_at,
  suspendedAt: r.suspended_at,
  counts: stats
    ? { members: stats.active_members, administrators: stats.active_admins, students: stats.students, campuses: stats.campuses }
    : NO_COUNTS,
});

/// What the database function raised, by the stable names the migration gives its exceptions (and the unique-index backstop on the code).
function dbReason(error: unknown): "NOT_PLATFORM_ADMIN" | "HAS_PERIODS" | "HAS_ADMINISTRATOR" | "INVALID" | "CODE_TAKEN" | null {
  const text = [
    error instanceof Error ? error.message : "",
    typeof error === "object" && error && "meta" in error ? JSON.stringify((error as { meta: unknown }).meta) : "",
  ].join(" ");
  if (text.includes("platform_admin_required")) return "NOT_PLATFORM_ADMIN";
  if (text.includes("platform_school_has_periods")) return "HAS_PERIODS";
  if (text.includes("platform_school_has_admin")) return "HAS_ADMINISTRATOR";
  if (text.includes("platform_invalid_input") || text.includes("platform_reason_required")) return "INVALID";
  if (/Tenant_code_key|duplicate key|23505|Unique constraint/i.test(text)) return "CODE_TAKEN";
  return null;
}

export async function listSchools(actorUserId: string): Promise<PlatformSchool[]> {
  const { rows, stats } = await forUser(actorUserId).transaction(async (tx) => ({
    rows: await tx.$queryRaw<SchoolRow[]>`SELECT * FROM platform_list_schools()`,
    stats: await tx.$queryRaw<StatsRow[]>`SELECT * FROM platform_school_stats()`,
  }));
  const byId = new Map(stats.map((row) => [row.tenant_id, row]));
  return rows.map((row) => toSchool(row, byId.get(row.id)));
}

async function schoolById(actorUserId: string, id: string): Promise<PlatformSchool | null> {
  return (await listSchools(actorUserId)).find((s) => s.id === id) ?? null;
}

export type CreateSchoolResult =
  | { ok: true; school: PlatformSchool; invitation: { id: string; email: string; token: string } }
  | { ok: false; reason: "CODE_TAKEN" | "NOT_PLATFORM_ADMIN" | "INVALID" };

/// Creates the school AND the invitation for its first administrator in ONE transaction: either both exist or neither does, so a school can never be
/// left that nobody can ever administer. The new school's id comes from the function that has just created it in this very transaction, which is the
/// proof `trustedTenantId` asks for (the same justification as the first-run setup route).
export async function createSchool(
  actorUserId: string,
  input: { code: string; name: string; schoolType: SchoolType; adminEmail: string },
): Promise<CreateSchoolResult> {
  try {
    const token = newInvitationToken();
    const made = await forUser(actorUserId).transaction(async (tx) => {
      const [{ platform_create_school: id }] = await tx.$queryRaw<{ platform_create_school: string }[]>`
        SELECT platform_create_school(${input.code}, ${input.name}, ${input.schoolType}::"SchoolType")`;
      await setTenantContext(tx, trustedTenantId(id));
      const invitation = await tx.invitation.create({
        data: {
          tenantId: id,
          email: input.adminEmail,
          role: "ADMIN",
          campusId: null,
          tokenHash: hashInvitationToken(token),
          invitedById: actorUserId,
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId: id,
          actorUserId,
          action: "INVITATION_CREATED",
          targetType: "Invitation",
          targetId: invitation.id,
          afterValue: { email: input.adminEmail, role: "ADMIN", campusId: null, firstAdministrator: true },
        },
      });
      return { id, invitationId: invitation.id };
    });
    const school = await schoolById(actorUserId, made.id);
    if (!school) throw new Error("the school just created is not in the platform list");
    return { ok: true, school, invitation: { id: made.invitationId, email: input.adminEmail, token } };
  } catch (error) {
    const reason = dbReason(error);
    if (reason === "NOT_PLATFORM_ADMIN" || reason === "INVALID" || reason === "CODE_TAKEN") return { ok: false, reason };
    throw error;
  }
}

export type ReinviteResult =
  | { ok: true; school: PlatformSchool; invitation: { id: string; email: string; token: string }; revoked: number }
  | { ok: false; reason: "NOT_FOUND" | "HAS_ADMINISTRATOR" | "NOT_PLATFORM_ADMIN" | "INVALID" };

/// Sends a school's first administrator a NEW invitation (ISS-0015): for a school that has no active ADMIN - the database function checks that LIVE inside
/// the school and refuses otherwise - and nothing else. In ONE transaction: the function (which writes the platform's audit row), then, in the school's
/// context, every open ADMIN invitation is revoked and one new one is written, each with a row in the school's own audit log. Either all of it happens or
/// none. The school's id is proof enough for `trustedTenantId`: the function has just answered that this very school exists (the same justification as
/// `createSchool`). The platform administrator gains no access to the school: whoever opens the link becomes its administrator.
export async function reinviteFirstAdministrator(actorUserId: string, tenantId: string, email: string): Promise<ReinviteResult> {
  try {
    const token = newInvitationToken();
    const made = await forUser(actorUserId).transaction(async (tx) => {
      const [{ platform_authorize_first_admin_invite: found }] = await tx.$queryRaw<{ platform_authorize_first_admin_invite: boolean }[]>`
        SELECT platform_authorize_first_admin_invite(${tenantId}, ${email})`;
      if (!found) return null;
      await setTenantContext(tx, trustedTenantId(tenantId));
      const now = new Date();
      const open = await tx.invitation.findMany({
        where: { tenantId, role: "ADMIN", acceptedAt: null, revokedAt: null },
        select: { id: true, email: true },
      });
      for (const old of open) {
        await tx.invitation.update({ where: { id: old.id }, data: { revokedAt: now } });
        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            action: "INVITATION_REVOKED",
            targetType: "Invitation",
            targetId: old.id,
            afterValue: { email: old.email },
            reason: "replaced by a new first-administrator invitation (platform)",
          },
        });
      }
      const invitation = await tx.invitation.create({
        data: {
          tenantId,
          email,
          role: "ADMIN",
          campusId: null,
          tokenHash: hashInvitationToken(token),
          invitedById: actorUserId,
          expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "INVITATION_CREATED",
          targetType: "Invitation",
          targetId: invitation.id,
          afterValue: { email, role: "ADMIN", campusId: null, firstAdministrator: true, reinvited: true },
        },
      });
      return { invitationId: invitation.id, revoked: open.length };
    });
    if (!made) return { ok: false, reason: "NOT_FOUND" };
    const school = await schoolById(actorUserId, tenantId);
    if (!school) return { ok: false, reason: "NOT_FOUND" };
    return { ok: true, school, invitation: { id: made.invitationId, email, token }, revoked: made.revoked };
  } catch (error) {
    const reason = dbReason(error);
    if (reason === "HAS_ADMINISTRATOR" || reason === "NOT_PLATFORM_ADMIN" || reason === "INVALID") return { ok: false, reason };
    throw error;
  }
}

export type ChangeResult =
  | { ok: true; school: PlatformSchool; changed: boolean }
  | { ok: false; reason: "NOT_FOUND" | "HAS_PERIODS" | "NOT_PLATFORM_ADMIN" | "INVALID" };

export async function setSchoolType(actorUserId: string, tenantId: string, schoolType: SchoolType): Promise<ChangeResult> {
  try {
    const before = await schoolById(actorUserId, tenantId);
    if (!before) return { ok: false, reason: "NOT_FOUND" };
    const found = await forUser(actorUserId).transaction(
      (tx) =>
        tx.$queryRaw<{ platform_set_school_type: boolean }[]>`SELECT platform_set_school_type(${tenantId}, ${schoolType}::"SchoolType")`,
    );
    if (!found[0]?.platform_set_school_type) return { ok: false, reason: "NOT_FOUND" };
    const school = await schoolById(actorUserId, tenantId);
    return school ? { ok: true, school, changed: before.schoolType !== schoolType } : { ok: false, reason: "NOT_FOUND" };
  } catch (error) {
    const reason = dbReason(error);
    if (reason === "HAS_PERIODS" || reason === "NOT_PLATFORM_ADMIN" || reason === "INVALID") return { ok: false, reason };
    throw error;
  }
}

export async function setSchoolSuspended(
  actorUserId: string,
  tenantId: string,
  suspended: boolean,
  reason: string | null,
): Promise<ChangeResult> {
  try {
    const before = await schoolById(actorUserId, tenantId);
    if (!before) return { ok: false, reason: "NOT_FOUND" };
    const found = await forUser(actorUserId).transaction(
      (tx) =>
        tx.$queryRaw<{ platform_set_school_suspended: boolean }[]>`
          SELECT platform_set_school_suspended(${tenantId}, ${suspended}, ${reason})`,
    );
    if (!found[0]?.platform_set_school_suspended) return { ok: false, reason: "NOT_FOUND" };
    const school = await schoolById(actorUserId, tenantId);
    return school ? { ok: true, school, changed: (before.suspendedAt !== null) !== suspended } : { ok: false, reason: "NOT_FOUND" };
  } catch (error) {
    const why = dbReason(error);
    if (why === "NOT_PLATFORM_ADMIN" || why === "INVALID") return { ok: false, reason: why };
    throw error;
  }
}

export async function listAudit(actorUserId: string, limit: number): Promise<PlatformAuditEntry[]> {
  const rows = await forUser(actorUserId).transaction(
    (tx) =>
      tx.$queryRaw<
        { id: string; actor_user_id: string; action: string; target_tenant_id: string | null; reason: string | null; created_at: Date }[]
      >`SELECT * FROM platform_list_audit(${limit}::int)`,
  );
  return rows.map((r) => ({
    id: r.id,
    actorUserId: r.actor_user_id,
    action: r.action,
    targetTenantId: r.target_tenant_id,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}
