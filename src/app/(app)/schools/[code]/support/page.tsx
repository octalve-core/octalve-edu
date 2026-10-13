import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { SupportAccessPanel } from "@/components/support/SupportAccessPanel";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "Support access" };
export const dynamic = "force-dynamic";

// The school's side of audited support access (task 0011, ADR 0017): the school ADMINISTRATOR allows a platform administrator to read chosen parts of the
// school for a few hours, withdraws it, and reads what was looked at. No area is declared: a support view can never reach these controls. The API enforces
// the same rules again.
export default async function SupportAccessPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { tenant } = await requireTenantPage(code);
  if (tenant.role !== "ADMIN" || tenant.support) forbidden();

  return (
    <div>
      <PageHeader
        title="Support access"
        description={`Let the platform team look at parts of ${tenant.tenantName} while they help you, and see what they looked at.`}
      />
      <SupportAccessPanel schoolCode={tenant.tenantCode} />
    </div>
  );
}
