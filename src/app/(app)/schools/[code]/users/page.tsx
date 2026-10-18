import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { UsersPanel } from "@/components/users/UsersPanel";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

// The school's people and invitations (plan §0.5.4) — school and campus administrators (a campus administrator sees and manages their own campus's people only). The page resolves the school from the person's OWN membership
// (403 otherwise) and then requires the ADMIN role IN THAT SCHOOL: anyone else gets the same 403 view as a stranger, so the page does not
// say a role was the problem. The list itself comes from the members API, which enforces the same rule again.
export default async function UsersPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { session, tenant } = await requireTenantPage(code, "people");
  if (tenant.role !== "ADMIN" && tenant.role !== "CAMPUS_ADMIN") forbidden();

  // A campus administrator is shown their own campus only; the API enforces the same.
  const campuses = await tenant.run((tx) =>
    tx.campus.findMany({
      where: { tenantId: tenant.tenantId, ...(tenant.role === "CAMPUS_ADMIN" ? { id: tenant.campusId ?? "none" } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  );

  return (
    <div>
      <PageHeader
        title="Users"
        description={`The people who can sign in to ${tenant.tenantName}, and the invitations still waiting for an answer.`}
      />
      {/* A support view only reads: every control is switched off (a disabled fieldset disables everything inside it). The API refuses a write anyway. */}
      <fieldset disabled={Boolean(tenant.support)} className="min-w-0">
        <UsersPanel
          schoolCode={tenant.tenantCode}
          schoolName={tenant.tenantName}
          campuses={campuses}
          currentUserId={session.userId}
          actorRole={tenant.role}
        />
      </fieldset>
    </div>
  );
}
