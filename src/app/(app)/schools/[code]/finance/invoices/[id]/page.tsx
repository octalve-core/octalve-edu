import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { InvoiceDetailView, type InvoiceDetailData } from "@/components/finance/InvoiceDetailView";
import { getStudentInvoice } from "@/lib/finance/service";
import { partPaymentFor } from "@/lib/finance/part-payment-service";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

// One invoice: what was charged, what was paid, the discounts, the way to pay or record a payment, and what the school's rule says about paying it in parts. Who may open it is
// decided by `getStudentInvoice` (finance staff any, a campus administrator their campus's); a refusal or a missing invoice is the same 404, so an id says nothing. No support area:
// finance is not a grantable area (ADR 0017).
export default async function InvoicePage({ params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  const { session, tenant } = await requireTenantPage(code);
  const canManageFinance = tenant.role === "ADMIN" || tenant.permissions.includes("CAN_MANAGE_FINANCE");
  if (tenant.role !== "ADMIN" && tenant.role !== "CAMPUS_ADMIN" && !canManageFinance) forbidden();

  let invoice;
  try {
    invoice = await getStudentInvoice(tenant.tenantId, id, {
      userId: session.userId,
      roles: [tenant.role],
      permissions: [...tenant.permissions],
      campusId: tenant.campusId,
    });
  } catch {
    notFound();
  }
  const partPayment = await tenant.run((tx) => partPaymentFor(tx, tenant.tenantId, invoice));
  const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

  return (
    <InvoiceDetailView
      schoolCode={tenant.tenantCode}
      invoice={plain(invoice) as unknown as InvoiceDetailData}
      canManageFinance={canManageFinance && !tenant.support}
      canChangeRules={tenant.role === "ADMIN" && !tenant.support}
      partPayment={plain(partPayment)}
      tenantName={tenant.tenantName}
    />
  );
}
