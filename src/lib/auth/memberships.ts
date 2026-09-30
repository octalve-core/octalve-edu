import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

export type UserMembership = {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  campusId: string | null;
  campusName: string | null;
  role: Role;
};

/// The schools a user belongs to, with their role in each. `Tenant` and
/// `TenantMembership` are identity tables (queried before any tenant is
/// known), deliberately NOT RLS-scoped by tenant — see §0.5.2's explicit
/// exception list. Ordinary WHERE-userId conditions protect them, as here.
export async function getUserMemberships(userId: string): Promise<UserMembership[]> {
  const rows = await prisma.tenantMembership.findMany({
    where: { userId },
    include: { tenant: { select: { id: true, code: true, name: true } }, campus: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((m) => ({
    tenantId: m.tenant.id,
    tenantCode: m.tenant.code,
    tenantName: m.tenant.name,
    campusId: m.campusId,
    campusName: m.campus?.name ?? null,
    role: m.role,
  }));
}
