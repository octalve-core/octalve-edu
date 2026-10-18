import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { SchoolSettingsPanel } from "@/components/settings/SchoolSettingsPanel";
import { requireTenantPage } from "@/lib/tenant/page-tenant";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

// School settings and configurability panel (PRD §14, plan §1.3, roadmap §1.7) — administrators only.
// Requires step-up re-authentication on every write and maintains an immutable audit ledger.
export default async function SettingsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { tenant } = await requireTenantPage(code, "settings");
  if (tenant.role !== "ADMIN") forbidden();

  return (
    <div>
      <PageHeader
        title="Settings"
        description={`Configure academic workflows, billing policies, and security controls for ${tenant.tenantName}.`}
      />
      {!tenant.support && (
        <p className="mb-6 text-sm text-fg-muted">
          Need help from the platform team?{" "}
          <Link href={`/schools/${tenant.tenantCode}/support`} className="font-semibold text-brand-fg underline">
            Support access
          </Link>{" "}
          lets you allow them to look at parts of the school, and shows what they looked at.
        </p>
      )}
      {/* A support view only reads: the whole form is switched off (a disabled fieldset disables every control inside it). The API refuses a write anyway. */}
      <fieldset disabled={Boolean(tenant.support)} className="min-w-0">
        <SchoolSettingsPanel schoolCode={tenant.tenantCode} />
      </fieldset>
    </div>
  );
}
