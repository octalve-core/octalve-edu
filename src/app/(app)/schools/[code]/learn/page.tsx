import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { LearnSections } from "@/components/learn/LearnSections";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "My work" };
export const dynamic = "force-dynamic";

// A pupil's own work (task 0025, slices O3 and O4): the practice sets, questionnaires and paper work set for them, and the question practice they do for themselves. Pupils only: the
// portal routes behind it answer anyone else 403, so the page does not draw what they would refuse. The page declares NO support area, so a platform administrator's support view gets
// the 403 view too. Display only: the APIs decide who the pupil is, what is open for them and what they may see.
export default async function LearnPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { tenant } = await requireTenantPage(code);
  if (tenant.role !== "STUDENT") forbidden();
  return (
    <div className="space-y-6">
      <PageHeader
        title="My work"
        description="Practice sets, questionnaires and paper work set for you, and questions to practise on your own."
      />
      <LearnSections schoolCode={tenant.tenantCode} />
    </div>
  );
}
