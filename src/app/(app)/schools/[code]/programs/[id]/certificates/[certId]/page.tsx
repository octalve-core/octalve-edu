import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { CertificatePrint } from "@/components/programs/CertificatePrint";
import { PageHeader } from "@/components/shell/PageHeader";
import { viewerOf } from "@/lib/programs/access";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "Certificate", referrer: "no-referrer", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const SHAPE = /^[A-Za-z0-9_-]{1,64}$/;
const STAFF = new Set(["ADMIN", "CAMPUS_ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF"]);

// One certificate, print-ready (task 0027, slice P5). Whoever has no place in the program is told "We could not find that certificate.", the same as for one that does not exist; the
// certificate itself is fetched from the API, which decides again who may see it. Printed from the browser: there is no PDF library.
export default async function CertificateRoute({ params }: { params: Promise<{ code: string; id: string; certId: string }> }) {
  const { code, id, certId } = await params;
  const { session, tenant } = await requireTenantPage(code);
  if (!STAFF.has(tenant.role)) forbidden();
  const viewer =
    SHAPE.test(id) && SHAPE.test(certId) ? await tenant.run((tx) => viewerOf({ userId: session.userId, tenant }, tx, id)) : null;
  if (!viewer) {
    return (
      <div className="space-y-4">
        <PageHeader title="Certificate" />
        <p role="alert" className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-fg-muted">
          We could not find that certificate.
        </p>
        <Link
          href={`/schools/${tenant.tenantCode}/programs`}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-fg hover:underline"
        >
          <span aria-hidden="true">←</span>
          All programs
        </Link>
      </div>
    );
  }
  return <CertificatePrint schoolCode={tenant.tenantCode} programId={id} certId={certId} />;
}
