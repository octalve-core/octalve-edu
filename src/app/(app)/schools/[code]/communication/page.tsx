import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { CommunicationPanel } from "@/components/communication/CommunicationPanel";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "Communication" };
export const dynamic = "force-dynamic";

export default async function CommunicationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { tenant } = await requireTenantPage(code);

  if (tenant.role !== "ADMIN" && tenant.role !== "CAMPUS_ADMIN") {
    forbidden();
  }

  // Load campuses and class arms for audience filtering under tenant RLS
  const [campuses, classArms] = await Promise.all([
    tenant.run((tx) =>
      tx.campus.findMany({
        where: {
          tenantId: tenant.tenantId,
          ...(tenant.role === "CAMPUS_ADMIN" ? { id: tenant.campusId ?? "none" } : {}),
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ),
    tenant.run((tx) =>
      tx.classArm.findMany({
        where: {
          tenantId: tenant.tenantId,
          archivedAt: null,
        },
        select: {
          id: true,
          name: true,
          classGroup: { select: { name: true } },
        },
        orderBy: [{ classGroup: { name: "asc" } }, { name: "asc" }],
      }),
    ),
  ]);

  return (
    <div>
      <PageHeader
        title="Communication"
        description={`Multi-channel messaging engine for ${tenant.tenantName} — broadcast announcements, notification templates, and delivery diagnostics.`}
      />
      <fieldset disabled={Boolean(tenant.support)} className="min-w-0">
        <CommunicationPanel schoolCode={tenant.tenantCode} campuses={campuses} classArms={classArms} />
      </fieldset>
    </div>
  );
}
