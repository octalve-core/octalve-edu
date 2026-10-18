import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { AssessmentPanel } from "@/components/academics/AssessmentPanel";
import { AttendancePanel } from "@/components/academics/AttendancePanel";
import { ClassesPanel } from "@/components/academics/ClassesPanel";
import { GradingPanel } from "@/components/academics/GradingPanel";
import { SectionNav } from "@/components/academics/SectionNav";
import { SessionsPanel } from "@/components/academics/SessionsPanel";
import { TimetablePanel } from "@/components/academics/TimetablePanel";
import { LmsPanel } from "@/components/lms/LmsPanel";
import { isSection } from "@/components/academics/model";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "Academic setup" };
export const dynamic = "force-dynamic";

// Academic setup (plan "Build design — Phase 1.0 and 1.1", and 1.2 decision P9): the school year and its terms, the classes and subjects, how marks are built
// and how scores become grades. Administrators change it; staff may LOOK (the same four sections with every control that writes left out); students and
// parents get the one access-denied view. Like the Users page it resolves the school from the person's OWN membership (403 otherwise); the lists and every
// change go through the academics API, which enforces the same rules again — hiding a button is a courtesy, not the guard.
export default async function AcademicsPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const { code } = await params;
  const { section: asked } = await searchParams;
  // The attendance section is its own support area; everything else here is academic setup (ADR 0017).
  const { tenant } = await requireTenantPage(code, asked === "attendance" ? "attendance" : "academics");
  if (tenant.role !== "ADMIN" && tenant.role !== "CAMPUS_ADMIN" && tenant.role !== "TEACHING_STAFF" && tenant.role !== "NON_TEACHING_STAFF")
    forbidden();
  const readOnly = tenant.role !== "ADMIN" || Boolean(tenant.support); // a support view only reads
  // A campus administrator (ADR 0016) builds their own campus's calendar and classes; everything else here stays read-only for them, and a row the whole
  // school owns is shown read-only too. The academics API enforces the same rules again.
  const campusAdmin = tenant.role === "CAMPUS_ADMIN" && tenant.campusId !== null;
  const ownCampusId = campusAdmin ? tenant.campusId : null;

  // Taking the roll is open to the people the attendance API admits (lib/attendance/http.ts WRITE_ROLES): administrators and teachers. Which ARMS a teacher
  // or campus administrator may take is decided by the API and the list it offers (ISS-0013); registrars (non-teaching staff) only look.
  const canTakeRoll = !tenant.support && (tenant.role === "ADMIN" || tenant.role === "CAMPUS_ADMIN" || tenant.role === "TEACHING_STAFF");

  const section = isSection(asked) ? asked : "timetable";
  const [campuses, subjects, classGroups] = await tenant.run((tx) =>
    Promise.all([
      tx.campus.findMany({ where: { tenantId: tenant.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
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
        title="Academic setup"
        description={
          campusAdmin
            ? `The school year, classes, subjects, timetable and grading for ${tenant.tenantName}. You can change the sessions and classes of your own campus; the rest is set by the school administrator.`
            : tenant.role === "TEACHING_STAFF"
              ? `The school year, classes, subjects, timetable and grading for ${tenant.tenantName}. You can take the roll for the classes you are assigned to; the rest is set by an administrator.`
              : readOnly
                ? `The school year, classes, subjects, timetable and grading for ${tenant.tenantName}. Only an administrator can change this.`
                : `The school year, classes, subjects, timetable and grading for ${tenant.tenantName}. Nothing here is ever deleted — old items are archived.`
        }
      />
      <SectionNav schoolCode={tenant.tenantCode} current={section} />
      <div className="mt-8">
        {section === "timetable" && <TimetablePanel schoolCode={tenant.tenantCode} readOnly={readOnly} />}
        {section === "attendance" && <AttendancePanel schoolCode={tenant.tenantCode} readOnly={!canTakeRoll} />}
        {section === "lms" && (
          <LmsPanel schoolCode={tenant.tenantCode} canManage={canTakeRoll} subjects={subjects} classGroups={classGroups} />
        )}
        {section === "sessions" && (
          <SessionsPanel
            schoolCode={tenant.tenantCode}
            campuses={campuses}
            schoolType={tenant.schoolType}
            readOnly={readOnly && !campusAdmin}
            ownCampusId={ownCampusId}
          />
        )}
        {section === "classes" && (
          <ClassesPanel schoolCode={tenant.tenantCode} campuses={campuses} readOnly={readOnly && !campusAdmin} ownCampusId={ownCampusId} />
        )}
        {section === "assessment" && <AssessmentPanel schoolCode={tenant.tenantCode} readOnly={readOnly} />}
        {section === "grading" && <GradingPanel schoolCode={tenant.tenantCode} readOnly={readOnly} />}
      </div>
    </div>
  );
}
