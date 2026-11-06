import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { FormPage } from "@/components/forms/FormPage";
import { FormsApiProvider } from "@/components/forms/FormsApi";
import { reachForm } from "@/lib/forms/access";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "Form" };
export const dynamic = "force-dynamic";

const STAFF = new Set(["ADMIN", "CAMPUS_ADMIN", "TEACHING_STAFF"]);
const SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

// One form (task 0025). The page only finds the form's kind and title so the screen can ask the APIs for the rest; it says nothing about a form of another campus or school, which looks
// exactly like a form that does not exist (`reachForm`, the one rule of who may reach a form by its id). Display only: the APIs behind it decide who may do what.
export default async function FormRoute({ params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  const { session, tenant } = await requireTenantPage(code);
  if (!STAFF.has(tenant.role)) forbidden();

  const form = SHAPE.test(id)
    ? await tenant.run(async (tx) => {
        const reached = await reachForm(tx, { tenantId: tenant.tenantId, userId: session.userId, formId: id, access: "view" });
        if (!reached) return null;
        const row = await tx.form.findFirst({
          where: { id: reached.id, tenantId: tenant.tenantId },
          select: { id: true, kind: true, title: true },
        });
        return row;
      })
    : null;

  if (!form) {
    return (
      <div className="space-y-4">
        <PageHeader title="Form" />
        <p role="alert" className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          We could not find that form.
        </p>
        <Link
          href={`/schools/${tenant.tenantCode}/forms`}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-fg hover:underline"
        >
          <span aria-hidden="true">←</span>
          Back to Forms
        </Link>
      </div>
    );
  }
  return (
    <FormsApiProvider schoolCode={tenant.tenantCode}>
      <FormPage formId={form.id} kind={form.kind} initialTitle={form.title} />
    </FormsApiProvider>
  );
}
