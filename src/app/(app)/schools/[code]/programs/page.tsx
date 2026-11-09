import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { ProgramsList } from "@/components/programs/ProgramsList";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "Programs" };
export const dynamic = "force-dynamic";

const STAFF = new Set(["ADMIN", "CAMPUS_ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF"]);

// Programs (task 0027, slice P1): learning that is not a normal class. The school's administrator makes them; a program admin they name runs one; a campus administrator reads the programs that
// run in their campus. A member of staff with no place in any program sees an empty list. The page declares NO support area, so a platform administrator's support view gets the 403 view
// here. Display only: the API behind it decides who may do what, and says 404 for a program the person has no place in.
export default async function ProgramsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { tenant } = await requireTenantPage(code);
  if (!STAFF.has(tenant.role)) forbidden();
  const isAdmin = tenant.role === "ADMIN";
  const campuses = isAdmin
    ? await tenant.run((tx) =>
        tx.campus.findMany({ where: { tenantId: tenant.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      )
    : [];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Programs"
        description={`Learning at ${tenant.tenantName} that is not a normal class: a memorisation program, a short course. Each has its own levels and groups.`}
      />
      <ProgramsList schoolCode={tenant.tenantCode} canCreate={isAdmin && !tenant.support} campuses={campuses} />
    </div>
  );
}
