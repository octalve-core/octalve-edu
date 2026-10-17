import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { LmsPanel } from "@/components/lms/LmsPanel";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "LMS & Assignments" };
export const dynamic = "force-dynamic";

export default async function SchoolLmsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const { tenant } = await requireTenantPage(code, "academics");
  if (
    tenant.role !== "ADMIN" &&
    tenant.role !== "CAMPUS_ADMIN" &&
    tenant.role !== "TEACHING_STAFF" &&
    tenant.role !== "NON_TEACHING_STAFF" &&
    tenant.role !== "STUDENT" &&
    tenant.role !== "PARENT"
  ) {
    forbidden();
  }

  const canManage =
    !tenant.support &&
    (tenant.role === "ADMIN" || tenant.role === "CAMPUS_ADMIN" || tenant.role === "TEACHING_STAFF");

  const [subjects, classGroups] = await tenant.run((tx) =>
    Promise.all([
      tx.subject.findMany({
        where: { tenantId: tenant.tenantId, archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      tx.classGroup.findMany({
        where: { tenantId: tenant.tenantId, archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]),
  );

  return (
    <div>
      <PageHeader
        title="Learning Management System (LMS)"
        description={`Assignments, course notes, and digital quizzes for ${tenant.tenantName}.`}
      />
      <div className="mt-8">
        <LmsPanel
          schoolCode={tenant.tenantCode}
          canManage={canManage}
          subjects={subjects}
          classGroups={classGroups}
        />
      </div>
    </div>
  );
}
