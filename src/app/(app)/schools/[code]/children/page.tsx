import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { ParentSections } from "@/components/learn/ParentSections";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "My children" };
export const dynamic = "force-dynamic";

// How practice is going for the pupils a guardian is linked to, and the questionnaires addressed to guardians (task 0025, slices O4 and O8). Guardians only. What they see is the school's own choice (nothing, how it is going, or the whole
// history) and is decided by the API, which says so in words; a guardian can change nothing. The page declares NO support area. Display only.
export default async function ChildrenPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { tenant } = await requireTenantPage(code);
  if (tenant.role !== "PARENT") forbidden();
  return (
    <div className="space-y-6">
      <PageHeader
        title="My children"
        description="How question practice is going for the pupils linked to you, as far as the school lets you see, and the questionnaires addressed to you."
      />
      <ParentSections schoolCode={tenant.tenantCode} />
    </div>
  );
}
