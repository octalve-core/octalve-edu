import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import type { FeeItem } from "@/components/finance/FeeStructuresPanel";
import { FinanceSections } from "@/components/finance/FinanceSections";
import type { InvoiceListItem } from "@/components/finance/InvoicesDashboard";
import { PageHeader } from "@/components/shell/PageHeader";
import { hasActiveMfa } from "@/lib/auth/mfa/service";
import { queryFeeStructures, queryInvoices } from "@/lib/finance/service";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "Finance" };
export const dynamic = "force-dynamic";

// Finance (task 0029 slice F2): the school's invoices, its fee structures and its payment rules. The school's administrator and a campus administrator reach it, and so does any member of
// staff the school has given the finance permission. The page declares NO support area (finance is not a grantable area, ADR 0017), so a platform administrator's support view gets the
// 403 view here. Display only: the finance APIs decide who may see and do what, in which campus, and each change asks them again.
export default async function FinancePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { session, tenant } = await requireTenantPage(code);
  const canManageFinance = tenant.role === "ADMIN" || tenant.permissions.includes("CAN_MANAGE_FINANCE");
  if (tenant.role !== "ADMIN" && tenant.role !== "CAMPUS_ADMIN" && !canManageFinance) forbidden();

  const requester = { userId: session.userId, roles: [tenant.role], permissions: [...tenant.permissions], campusId: tenant.campusId };
  const [list, fees, lookups] = await Promise.all([
    queryInvoices(tenant.tenantId, requester, { pageSize: 100 }),
    queryFeeStructures(tenant.tenantId),
    tenant.run(async (tx) => ({
      periods: await tx.academicPeriod.findMany({
        where: { tenantId: tenant.tenantId, archivedAt: null },
        select: { id: true, label: true },
        orderBy: [{ startDate: "desc" }],
      }),
      classGroups: await tx.classGroup.findMany({
        where: { tenantId: tenant.tenantId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    })),
  ]);
  const hasMfa = tenant.role === "ADMIN" ? await hasActiveMfa(session.userId) : false;

  // Decimals and dates cross to the browser as text.
  const plain = <T,>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        description={`The invoices, fee structures and payment rules of ${tenant.tenantName}. The most recent 100 invoices are listed; narrow them with the filters.`}
      />
      <FinanceSections
        schoolCode={tenant.tenantCode}
        invoices={plain<InvoiceListItem[]>(list.items)}
        feeStructures={plain<FeeItem[]>(fees)}
        periods={lookups.periods}
        classGroups={lookups.classGroups}
        canManageFinance={canManageFinance && !tenant.support}
        canChangeRules={tenant.role === "ADMIN" && !tenant.support}
        hasMfa={hasMfa}
      />
    </div>
  );
}
