import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { LearnSections } from "@/components/learn/LearnSections";
import { StandingNotice } from "@/components/standing/StandingNotice";
import { dayOf, studentStandingNow } from "@/lib/standing/rules";
import { today } from "@/lib/standing/common";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "My work" };
export const dynamic = "force-dynamic";

// A pupil's own work (task 0025, slices O3 and O4): the practice sets, questionnaires and paper work set for them, and the question practice they do for themselves. Pupils only: the
// portal routes behind it answer anyone else 403, so the page does not draw what they would refuse. The page declares NO support area, so a platform administrator's support view gets
// the 403 view too. Display only: the APIs decide who the pupil is, what is open for them and what they may see.
export default async function LearnPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { session, tenant } = await requireTenantPage(code);
  if (tenant.role !== "STUDENT") forbidden();
  // A suspension that applies today is told to the pupil (without its reason); an ended one is not.
  const record = await tenant.run((tx) =>
    tx.studentRecord.findFirst({
      where: { tenantId: tenant.tenantId, userId: session.userId },
      select: { standing: true, standingUntil: true },
    }),
  );
  const suspended = record !== null && studentStandingNow(record, today()) === "SUSPENDED";
  return (
    <div className="space-y-6">
      <PageHeader
        title="My work"
        description="Practice sets, questionnaires and paper work set for you, and questions to practise on your own."
      />
      {suspended && <StandingNotice until={record.standingUntil ? dayOf(record.standingUntil) : null} />}
      <LearnSections schoolCode={tenant.tenantCode} />
    </div>
  );
}
