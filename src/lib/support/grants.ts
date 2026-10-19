import type { TenantAuthContext } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
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
  granteeName: string | null;
  granteeEmail: string | null;
};

type Row = {
  id: string;
  areas: string[];
  reason: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  createdBy: { name: string | null } | null;
  grantee: { name: string | null; email: string | null } | null;
};
const SELECT = {
  id: true,
  areas: true,
  reason: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  createdBy: { select: { name: true } },
  grantee: { select: { name: true, email: true } },
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
    granteeName: row.grantee?.name ?? null,
    granteeEmail: row.grantee?.email ?? null,
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
  input: { areas: SupportArea[]; hours: number; reason: string; granteeUserId?: string | null },
): Promise<SupportGrantView> {
  const expiresAt = new Date(Date.now() + input.hours * 3600_000);
  const row = await tenant.run(async (tx) => {
    const created = await tx.supportGrant.create({
      data: {
        tenantId: tenant.tenantId,
        areas: input.areas,
        reason: input.reason,
        expiresAt,
        createdById: actorUserId,
        granteeUserId: input.granteeUserId ?? null,
      },
      select: SELECT,
    });
    await tx.auditLog.create({
      data: {
        tenantId: tenant.tenantId,
        actorUserId,
        action: "SUPPORT_GRANT_CREATED",
        targetType: "SupportGrant",
        targetId: created.id,
        afterValue: {
          areas: input.areas,
          hours: input.hours,
          expiresAt: expiresAt.toISOString(),
          granteeUserId: input.granteeUserId ?? null,
        },
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

export type SupportActivityView = {
  id: string;
  action: "SUPPORT_OPENED" | "SUPPORT_ACCESS" | "SUPPORT_CLOSED";
  at: string;
  who: string | null;
  detail: string;
};

/// What platform support did in this school: opening a view, each page or list it read, closing it - newest first, the last 100. Written by the database
/// function platform_support_record (migration 20261024100000); this only reads the school's own log.
export async function listSupportActivity(tenant: Tenant): Promise<SupportActivityView[]> {
  const rows = await tenant.run(async (tx) => {
    const logs = await tx.auditLog.findMany({
      where: { tenantId: tenant.tenantId, action: { in: ["SUPPORT_OPENED", "SUPPORT_ACCESS", "SUPPORT_CLOSED"] } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, action: true, createdAt: true, actorUserId: true, afterValue: true },
    });
    const people = await tx.user.findMany({
      where: { id: { in: [...new Set(logs.map((l) => l.actorUserId))] } },
      select: { id: true, name: true },
    });
    return { logs, names: new Map(people.map((p) => [p.id, p.name])) };
  });
  return rows.logs.map((l) => {
    const d = (l.afterValue ?? {}) as { method?: string; path?: string; areas?: string };
    return {
      id: l.id,
      action: l.action as SupportActivityView["action"],
      at: l.createdAt.toISOString(),
      who: rows.names.get(l.actorUserId) ?? null,
      detail:
        l.action === "SUPPORT_ACCESS"
          ? `${d.method ?? "GET"} ${d.path ?? ""}`.trim()
          : l.action === "SUPPORT_OPENED"
            ? `Allowed: ${d.areas ?? ""}`
            : "",
    };
  });
}

/// The platform administrator behind an email, or `null` when the address is not one. A platform administrator is a global account (no tenant column), so this is
/// read outside the tenant context on purpose, and only ever answers "is this a platform administrator", never a school member.
export async function findPlatformAdminByEmail(email: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true, isPlatformAdmin: true } });
  return user?.isPlatformAdmin ? user.id : null;
}
