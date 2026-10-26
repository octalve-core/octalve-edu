import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { QuestionBankSections } from "@/components/question-bank/QuestionBankSections";
import { hasActiveMfa } from "@/lib/auth/mfa/service";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "Question bank" };
export const dynamic = "force-dynamic";

// The question bank's administration (task 0024 slice B): who reviews questions, and the switches. The school's administrator sets the school's values and any campus's; a campus
// administrator chooses reviewers for their own campus and may only make a switch stricter for it. The page declares NO support area, so a platform administrator's support view
// gets the 403 view here (parity note section 5). Display only: the APIs behind it decide who may do what, and each change asks for the fresh proof.
export default async function QuestionBankPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { session, tenant } = await requireTenantPage(code);
  if (tenant.role !== "ADMIN" && tenant.role !== "CAMPUS_ADMIN") forbidden();

  const campuses = await tenant.run((tx) =>
    tx.campus.findMany({
      where: { tenantId: tenant.tenantId, ...(tenant.role === "CAMPUS_ADMIN" ? { id: tenant.campusId ?? "none" } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  );
  const hasMfa = await hasActiveMfa(session.userId);

  return (
    <div>
      <PageHeader
        title="Question bank"
        description={
          tenant.role === "ADMIN"
            ? `Choose who reviews questions and set the switches for ${tenant.tenantName}. A campus can only make a switch stricter than the school's.`
            : "Choose who reviews questions on your campus and make the switches stricter for it. The school's administrator sets the school's values."
        }
      />
      <QuestionBankSections schoolCode={tenant.tenantCode} hasMfa={hasMfa} actorRole={tenant.role} ownCampusId={tenant.campusId} campuses={campuses} />
    </div>
  );
}
