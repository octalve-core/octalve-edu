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
import { PromotionPanel } from "@/components/academics/promotion/PromotionPanel";
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

  // Rolling a class into the next session is for administrators (the school's, and a campus's for its own classes); the section is not offered to staff and is the 403 view if typed (task 0031).
  const mayPromote = tenant.role === "ADMIN" || tenant.role === "CAMPUS_ADMIN";
  const section = isSection(asked) ? asked : "timetable";
  if (section === "promotion" && !mayPromote) forbidden();
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

  // What the promotion screen picks from: the live sessions of the calendar the person works in and the live classes (a campus administrator: their campus's and the school's).
  const promotion =
    section === "promotion"
      ? await tenant.run(async (tx) => {
          const scope =
            tenant.role === "CAMPUS_ADMIN" && tenant.campusId !== null ? { OR: [{ campusId: null }, { campusId: tenant.campusId }] } : {};
          const campusName = new Map(campuses.map((c) => [c.id, c.name]));
          const [sessionRows, classRows] = await Promise.all([
            tx.academicSession.findMany({
              where: { tenantId: tenant.tenantId, archivedAt: null, ...scope },
              select: { id: true, label: true, startDate: true, status: true, campusId: true },
              orderBy: { startDate: "desc" },
            }),
            tx.classGroup.findMany({
              where: { tenantId: tenant.tenantId, archivedAt: null, ...scope },
              select: { id: true, name: true, sortOrder: true, campusId: true },
              orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            }),
          ]);
          const scopeOf = (campusId: string | null) => (campusId ? (campusName.get(campusId) ?? "Campus") : "Whole school");
          return {
            sessions: sessionRows.map((s) => ({
              id: s.id,
              label: s.label,
              startDate: s.startDate.toISOString().slice(0, 10),
              status: s.status,
              campusId: s.campusId,
              scope: scopeOf(s.campusId),
            })),
            classes: classRows.map((c) => ({
              id: c.id,
              name: c.name,
              sortOrder: c.sortOrder,
              campusId: c.campusId,
              scope: scopeOf(c.campusId),
            })),
          };
        })
      : null;

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
      <SectionNav schoolCode={tenant.tenantCode} current={section} hide={mayPromote ? [] : ["promotion"]} />
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
        {section === "promotion" && promotion && (
          <PromotionPanel
            schoolCode={tenant.tenantCode}
            sessions={promotion.sessions}
            classes={promotion.classes}
            schoolType={tenant.schoolType}
            readOnly={Boolean(tenant.support)}
          />
        )}
      </div>
    </div>
  );
}
