import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { FormsSections } from "@/components/forms/FormsSections";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "Forms" };
export const dynamic = "force-dynamic";

const STAFF = new Set(["ADMIN", "CAMPUS_ADMIN", "TEACHING_STAFF"]);

// Forms (task 0025): staff write practice sets, questionnaires and paper work, publish and close them, and mark what pupils hand in. The page declares NO support area, so a platform
// administrator's support view gets the 403 view here (the same as the question bank). Display only: the APIs behind it decide who may do what, in which campus.
export default async function FormsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { tenant } = await requireTenantPage(code);
  if (!STAFF.has(tenant.role)) forbidden();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Forms"
        description={`Write practice sets, questionnaires and paper work for ${tenant.tenantName}, publish them when they are ready, and mark what pupils hand in.`}
      />
      <FormsSections schoolCode={tenant.tenantCode} />
    </div>
  );
}
