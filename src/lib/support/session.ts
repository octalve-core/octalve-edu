import { prisma } from "@/lib/db";
import { forUser } from "@/lib/tenant/for-tenant";
import { isValidTenantCode } from "@/lib/tenant/validate-code";
import { SUPPORT_AREAS, type SupportArea } from "./areas";

// The support session (task 0011 slice B, ADR 0017). A platform administrator OPENS a school they hold a live grant for; the Session row remembers which
// school and since when. The view ends at the EARLIER of the grant's expiry and one hour after it was opened - and "still allowed" is decided from the
// grant itself on every request (platform_support_grants), so a revoke, an expiry or a suspension takes effect on the very next request.

export const SUPPORT_SESSION_MAX_MS = 60 * 60 * 1000;

/// What a request inside an open support view is allowed: read-only, and only these areas, until `endsAt`.
export type SupportView = { grantId: string; areas: readonly SupportArea[]; endsAt: Date };

type GrantRow = { tenant_id: string; grant_id: string; areas: string[]; expires_at: Date };

const isAreaList = (areas: string[]): areas is SupportArea[] => areas.every((a) => (SUPPORT_AREAS as readonly string[]).includes(a));

/// The live support view of `tenantId` for this person, given when they opened it - or null: not a platform administrator, no live grant, or the hour is over.
export async function liveSupportView(userId: string, tenantId: string, openedAt: Date): Promise<SupportView | null> {
  let rows: GrantRow[];
  try {
    rows = await forUser(userId).transaction((tx) => tx.$queryRaw<GrantRow[]>`SELECT * FROM platform_support_grants()`);
  } catch (error) {
    if (String(error instanceof Error ? error.message : error).includes("platform_admin_required")) return null;
    throw error;
  }
  const now = Date.now();
  const views = rows
    .filter((r) => r.tenant_id === tenantId && isAreaList(r.areas))
    .map((r) => ({
      grantId: r.grant_id,
      areas: r.areas as SupportArea[],
      endsAt: new Date(Math.min(r.expires_at.getTime(), openedAt.getTime() + SUPPORT_SESSION_MAX_MS)),
    }))
    .filter((v) => v.endsAt.getTime() > now)
    .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());
  return views[0] ?? null;
}

export type SupportAction = "SUPPORT_OPENED" | "SUPPORT_ACCESS" | "SUPPORT_CLOSED";

/// Writes one event to the school's audit log AND the platform's, after the database re-proves the grant is live for this person. False = not live: nothing was written.
export async function recordSupport(
  userId: string,
  tenantId: string,
  grantId: string,
  action: SupportAction,
  detail: Record<string, string>,
): Promise<boolean> {
  const rows = await forUser(userId).transaction(
    (tx) =>
      tx.$queryRaw<
        { ok: boolean }[]
      >`SELECT platform_support_record(${tenantId}, ${grantId}, ${action}, ${JSON.stringify(detail)}::jsonb) AS ok`,
  );
  return rows[0]?.ok === true;
}

export type OpenResult = { ok: true; view: SupportView; school: { code: string; name: string } } | { ok: false };

/// Opens the support view of the school with this code, on this sign-in. One answer ({ ok: false }) for every reason it cannot be: no such school, no live grant,
/// not a platform administrator.
export async function openSupport(userId: string, sessionId: string, code: string): Promise<OpenResult> {
  const clean = code.trim().toLowerCase();
  if (!isValidTenantCode(clean)) return { ok: false };
  const school = await prisma.tenant.findFirst({ where: { code: clean, suspendedAt: null }, select: { id: true, code: true, name: true } });
  if (!school) return { ok: false };
  const openedAt = new Date();
  const view = await liveSupportView(userId, school.id, openedAt);
  if (!view) return { ok: false };
  if (!(await recordSupport(userId, school.id, view.grantId, "SUPPORT_OPENED", { areas: view.areas.join(",") }))) return { ok: false };
  await prisma.session.updateMany({ where: { id: sessionId, userId }, data: { supportTenantId: school.id, supportOpenedAt: openedAt } });
  return { ok: true, view, school: { code: school.code, name: school.name } };
}

/// Ends the open support view on this sign-in (idempotent). Records the close when the grant is still live; an expired one has nothing left to write against.
export async function closeSupport(userId: string, sessionId: string): Promise<void> {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId },
    select: { supportTenantId: true, supportOpenedAt: true },
  });
  if (!session?.supportTenantId || !session.supportOpenedAt) return;
  const view = await liveSupportView(userId, session.supportTenantId, session.supportOpenedAt);
  if (view) await recordSupport(userId, session.supportTenantId, view.grantId, "SUPPORT_CLOSED", {});
  await prisma.session.updateMany({ where: { id: sessionId, userId }, data: { supportTenantId: null, supportOpenedAt: null } });
}

export type OpenableSchool = { code: string; name: string; areas: SupportArea[]; expiresAt: string };

/// The schools this person may open right now (one row per school: the grant that lasts longest).
export async function listOpenableSchools(userId: string): Promise<OpenableSchool[]> {
  let rows: GrantRow[];
  try {
    rows = await forUser(userId).transaction((tx) => tx.$queryRaw<GrantRow[]>`SELECT * FROM platform_support_grants()`);
  } catch (error) {
    if (String(error instanceof Error ? error.message : error).includes("platform_admin_required")) return [];
    throw error;
  }
  const best = new Map<string, GrantRow>();
  for (const r of rows)
    if (isAreaList(r.areas) && (best.get(r.tenant_id)?.expires_at.getTime() ?? 0) < r.expires_at.getTime()) best.set(r.tenant_id, r);
  const schools = await prisma.tenant.findMany({ where: { id: { in: [...best.keys()] } }, select: { id: true, code: true, name: true } });
  return schools
    .map((s) => ({
      code: s.code,
      name: s.name,
      areas: best.get(s.id)!.areas as SupportArea[],
      expiresAt: best.get(s.id)!.expires_at.toISOString(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
