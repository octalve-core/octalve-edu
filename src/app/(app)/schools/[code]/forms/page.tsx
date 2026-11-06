import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { FormsSections } from "@/components/forms/FormsSections";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "Forms" };
export const dynamic = "force-dynamic";

const WRITERS = new Set(["ADMIN", "CAMPUS_ADMIN", "TEACHING_STAFF"]);

// Forms (task 0025): staff write practice sets, questionnaires and paper work, publish and close them, mark what pupils hand in, and answer the questionnaires addressed to them (non-teaching
// staff have only that last part). The page declares NO support area, so a platform
// administrator's support view gets the 403 view here (the same as the question bank). Display only: the APIs behind it decide who may do what, in which campus.
export default async function FormsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { tenant } = await requireTenantPage(code);
  const canWrite = WRITERS.has(tenant.role);
  if (!canWrite && tenant.role !== "NON_TEACHING_STAFF") forbidden();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Forms"
        description={
          canWrite
            ? `Write practice sets, questionnaires and paper work for ${tenant.tenantName}, publish them when they are ready, mark what pupils hand in, and answer the questionnaires addressed to you.`
            : `The questionnaires addressed to you at ${tenant.tenantName}.`
        }
      />
      <FormsSections schoolCode={tenant.tenantCode} canWrite={canWrite} />
    </div>
  );
}
