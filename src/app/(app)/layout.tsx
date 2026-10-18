import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { requirePageSession } from "@/lib/auth/page-session";
import { supportBanner } from "@/lib/support/session";

/// Every signed-in page lives in this route group and so inside the shell. The layout only DISPLAYS who is signed in and
/// which schools they belong to — a layout isn't re-rendered when someone navigates between the pages it wraps, so each
/// page calls `requirePageSession()` (or `requireTenantPage`) itself; the call is cached per request, so that costs nothing
/// extra. What the shell shows is never what decides access.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { session, memberships, isPlatformAdmin } = await requirePageSession();

  // A support view (ADR 0017) is not a membership, so the school is added to the navigation for as long as the view is live.
  const support = await supportBanner(session.userId, session.support);
  const schools = memberships.map((m) => ({ code: m.tenantCode, name: m.tenantName, role: m.role }));
  if (support && !schools.some((s) => s.code === support.code)) schools.push({ code: support.code, name: support.name, role: "ADMIN" });

  return (
    <AppShell user={{ name: session.user.name, email: session.user.email }} schools={schools} platform={isPlatformAdmin} support={support}>
      {children}
    </AppShell>
  );
}
