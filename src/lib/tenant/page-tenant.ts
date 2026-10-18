import { forbidden } from "next/navigation";
import { requirePageSession } from "@/lib/auth/page-session";
import type { ResolvedSession } from "@/lib/auth/session";
import { recordSupport } from "@/lib/support/session";
import type { SupportArea } from "@/lib/support/areas";
import { forTenant, type Tx } from "@/lib/tenant/for-tenant";
import { resolveTenant, type TenantContext } from "@/lib/tenant/resolve-tenant";

/// The page-side twin of `withAuth(…, { tenant: true, roles })` (plan §0.5.2): resolves `/schools/[code]/…` for
/// the signed-in person, verifying THEIR membership — never trusting the URL — and returns the tenant context with
/// a tenant-scoped `run`. Not signed in → sign-in. No such school, or not a member of it →
/// the 403 view (`app/(app)/forbidden.tsx`), one answer for both. Authorization lives here, in the page's own
/// server code, never in `proxy`.
///
/// `area` (ADR 0017) is the part of the school this page shows. Inside a platform administrator's support view a page that declares none, or one outside
/// the granted areas, is the 403 view, and each page view is written to the school's log and the platform's.
export async function requireTenantPage(
  code: string,
  area?: SupportArea,
): Promise<{
  session: ResolvedSession;
  tenant: TenantContext & { run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> };
}> {
  const { session } = await requirePageSession();

  const resolved = await resolveTenant({ userId: session.userId, code, support: session.support });
  if (!resolved.ok) {
    if (resolved.status === 500) throw new Error("Tenant misconfigured — the cause is in the server log (TENANT_MISCONFIGURED)");
    forbidden();
  }
  const { tenant } = resolved;
  if (tenant.support) {
    if (!area || !tenant.support.areas.includes(area)) forbidden();
    if (
      !(await recordSupport(session.userId, tenant.tenantId, tenant.support.grantId, "SUPPORT_ACCESS", {
        method: "GET",
        path: `/schools/${tenant.tenantCode}`,
        area,
      }))
    ) {
      forbidden();
    }
  }

  return { session, tenant: { ...tenant, run: (fn) => forTenant(tenant.tenantId).transaction(fn) } };
}
