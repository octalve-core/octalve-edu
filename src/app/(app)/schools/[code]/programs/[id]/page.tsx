import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { ProgramView } from "@/components/programs/ProgramView";
import { isPlausibleId } from "@/lib/academics/http";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "Program" };
export const dynamic = "force-dynamic";

const STAFF = new Set(["ADMIN", "CAMPUS_ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF"]);

// One program: its details, campuses, level names, groups, admins and history. A program the person has no place in is the same 404 as one that does not exist (the API answers it). No
// support area: a program is the school's own structure. Display only.
export default async function ProgramPage({ params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  const { tenant } = await requireTenantPage(code);
  if (!STAFF.has(tenant.role)) forbidden();
  if (!isPlausibleId(id)) notFound();
  const campuses =
    tenant.role === "ADMIN"
      ? await tenant.run((tx) =>
          tx.campus.findMany({ where: { tenantId: tenant.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        )
      : [];
  return (
    <div className="space-y-6">
      <PageHeader title="Program" description={`A program of ${tenant.tenantName}.`} />
      <ProgramView schoolCode={tenant.tenantCode} programId={id} schoolCampuses={campuses} />
    </div>
  );
}
