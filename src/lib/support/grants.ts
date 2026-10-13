import type { TenantAuthContext } from "@/lib/auth/with-auth";
import { SUPPORT_AREAS, type SupportArea } from "./areas";

// A school's support grants (task 0011, ADR 0017): the school ADMIN creates a grant, lists them, revokes one. The database keeps a grant honest (areas,
// 24 hours, revoke-only - migration 20261024090000); this module is the school's side of it and writes the school's own audit rows.

type Tenant = TenantAuthContext["tenant"];

export type GrantStatus = "LIVE" | "EXPIRED" | "REVOKED";
export type SupportGrantView = {
  id: string;
  areas: SupportArea[];
  reason: string;
  status: GrantStatus;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  createdByName: string | null;
};

type Row = {
  id: string;
  areas: string[];
  reason: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  createdBy: { name: string | null } | null;
};
const SELECT = {
  id: true,
  areas: true,
  reason: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  createdBy: { select: { name: true } },
} as const;

const statusOf = (row: Pick<Row, "expiresAt" | "revokedAt">, now = new Date()): GrantStatus =>
  row.revokedAt ? "REVOKED" : row.expiresAt <= now ? "EXPIRED" : "LIVE";

function view(row: Row): SupportGrantView {
  return {
    id: row.id,
    areas: row.areas.filter((a): a is SupportArea => (SUPPORT_AREAS as readonly string[]).includes(a)),
    reason: row.reason,
    status: statusOf(row),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdBy?.name ?? null,
  };
}

export async function listGrants(tenant: Tenant): Promise<SupportGrantView[]> {
  const rows = await tenant.run((tx) =>
    tx.supportGrant.findMany({ where: { tenantId: tenant.tenantId }, orderBy: { createdAt: "desc" }, take: 100, select: SELECT }),
  );
  return rows.map(view);
}

export async function createGrant(
  tenant: Tenant,
  actorUserId: string,
  input: { areas: SupportArea[]; hours: number; reason: string },
): Promise<SupportGrantView> {
  const expiresAt = new Date(Date.now() + input.hours * 3600_000);
  const row = await tenant.run(async (tx) => {
    const created = await tx.supportGrant.create({
      data: { tenantId: tenant.tenantId, areas: input.areas, reason: input.reason, expiresAt, createdById: actorUserId },
      select: SELECT,
    });
    await tx.auditLog.create({
      data: {
        tenantId: tenant.tenantId,
        actorUserId,
        action: "SUPPORT_GRANT_CREATED",
        targetType: "SupportGrant",
        targetId: created.id,
        afterValue: { areas: input.areas, hours: input.hours, expiresAt: expiresAt.toISOString() },
        reason: input.reason,
      },
    });
    return created;
  });
  return view(row);
}

/// `null` when there is no such OPEN grant in this school (unknown, already revoked: one answer).
export async function revokeGrant(tenant: Tenant, actorUserId: string, id: string): Promise<SupportGrantView | null> {
  return tenant.run(async (tx) => {
    const claimed = await tx.supportGrant.updateMany({
      where: { id, tenantId: tenant.tenantId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) return null;
    await tx.auditLog.create({
      data: { tenantId: tenant.tenantId, actorUserId, action: "SUPPORT_GRANT_REVOKED", targetType: "SupportGrant", targetId: id },
    });
    return view(await tx.supportGrant.findUniqueOrThrow({ where: { id }, select: SELECT }));
  });
}
