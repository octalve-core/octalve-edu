import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { QuestionBankSections } from "@/components/question-bank/QuestionBankSections";
import { hasActiveMfa } from "@/lib/auth/mfa/service";
import { mayAuthorIn } from "@/lib/question-bank/rules";
import { loadViewer } from "@/lib/question-bank/viewer";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "Question bank" };
export const dynamic = "force-dynamic";

const STAFF = new Set(["ADMIN", "CAMPUS_ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF"]);

// The question bank (task 0024): staff write, browse and review questions; the school's administrator and a campus administrator also choose the reviewers and the switches (slice B).
// The page declares NO support area, so a platform administrator's support view gets the 403 view here (parity note section 5). Display only: the APIs behind it decide who may do
// what, and each administrator change asks for the fresh proof.
export default async function QuestionBankPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { session, tenant } = await requireTenantPage(code);
  if (!STAFF.has(tenant.role)) forbidden();
  const isAdmin = tenant.role === "ADMIN" || tenant.role === "CAMPUS_ADMIN";

  const { campuses, viewer } = await tenant.run(async (tx) => ({
    campuses: await tx.campus.findMany({ where: { tenantId: tenant.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    viewer: await loadViewer(tx, tenant.tenantId, session.userId),
  }));
  const hasMfa = isAdmin ? await hasActiveMfa(session.userId) : false;
  const canReview = viewer.isSchoolAdmin || viewer.memberships.some((m) => m.role === "CAMPUS_ADMIN") || viewer.reviewerRows.length > 0;
  const writeCampuses = campuses.filter((campus) => mayAuthorIn(viewer, campus.id));
  const wholeSchool = mayAuthorIn(viewer, null);
  // an administrator of one campus is shown that campus only
  const adminCampuses = tenant.role === "CAMPUS_ADMIN" ? campuses.filter((campus) => campus.id === tenant.campusId) : campuses;

  return (
    <div>
      <PageHeader
        title="Question bank"
        description={
          tenant.role === "ADMIN"
            ? `Write and review questions, choose who reviews them and set the switches for ${tenant.tenantName}. A campus can only make a switch stricter than the school's.`
            : tenant.role === "CAMPUS_ADMIN"
              ? "Write and review questions, choose who reviews them on your campus and make the switches stricter for it."
              : "Write questions, send them for review and browse the ones you may use."
        }
      />
      <QuestionBankSections
        schoolCode={tenant.tenantCode}
        hasMfa={hasMfa}
        actorRole={tenant.role}
        ownCampusId={tenant.campusId}
        campuses={adminCampuses}
        isAdmin={isAdmin}
        canReview={canReview}
        writeCampuses={writeCampuses}
        wholeSchool={wholeSchool}
      />
    </div>
  );
}
