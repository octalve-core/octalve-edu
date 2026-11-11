import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { CardsPanel } from "@/components/results/CardsPanel";
import { MarksPanel } from "@/components/results/MarksPanel";
import { ResultsNav, isResultTab } from "@/components/results/ResultsNav";
import { ReviewPanel } from "@/components/results/ReviewPanel";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "Results" };
export const dynamic = "force-dynamic";

// Results (task 0031): entering marks, reviewing and publishing them, and the report cards. It is a screen over the results API (lib/results), which decides on every request who may enter which
// subject in which class, who may approve what (the permission and the scope of ADR 0018), and what a pupil or parent is sent. The page only decides what to DRAW. The roles are those of the
// results API: administrators, campus administrators (their own campus only: task 0046), teachers and other staff.
export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { code } = await params;
  const { tab: asked } = await searchParams;
  const { tenant } = await requireTenantPage(code, "results");
  if (tenant.role !== "ADMIN" && tenant.role !== "CAMPUS_ADMIN" && tenant.role !== "TEACHING_STAFF" && tenant.role !== "NON_TEACHING_STAFF")
    forbidden();

  const enters = tenant.role === "ADMIN" || tenant.role === "CAMPUS_ADMIN" || tenant.role === "TEACHING_STAFF";
  const isAdmin = tenant.role === "ADMIN";
  const canApprove = !tenant.support && (isAdmin || (tenant.permissions ?? []).includes("CAN_APPROVE_RESULTS"));
  const tab = isResultTab(asked) && (enters || asked !== "marks") ? asked : enters ? "marks" : "review";
  const readOnly = Boolean(tenant.support) || !enters;

  return (
    <div>
      <PageHeader
        title="Results"
        description={
          enters
            ? `Enter marks, send them for review, publish them and print report cards for ${tenant.tenantName}. A teacher enters only the subjects they are assigned.`
            : `The marks and report cards of ${tenant.tenantName}. Entering marks is for teachers and administrators.`
        }
      />
      <ResultsNav schoolCode={tenant.tenantCode} current={tab} hide={enters ? [] : ["marks"]} />
      <div className="mt-8">
        {tab === "marks" && <MarksPanel schoolCode={tenant.tenantCode} readOnly={readOnly} />}
        {tab === "review" && <ReviewPanel schoolCode={tenant.tenantCode} canApprove={canApprove} isAdmin={isAdmin && !tenant.support} />}
        {tab === "cards" && <CardsPanel schoolCode={tenant.tenantCode} institution={tenant.tenantName} />}
      </div>
    </div>
  );
}
