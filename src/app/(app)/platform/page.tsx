import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { PlatformPanel } from "@/components/platform/PlatformPanel";
import { Alert } from "@/components/ui/Alert";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { hasActiveMfa } from "@/lib/auth/mfa/service";

export const metadata: Metadata = { title: "Platform" };
export const dynamic = "force-dynamic";

// The platform page (plan C5, ADR 0016): the installation's schools - create, suspend, reinstate, change the type - for PLATFORM ADMINISTRATORS only.
// Not part of any school: it has no school code and reads no school's data. Anyone who is not a platform administrator gets the same 403 view as a
// stranger; one without two-step verification is told to turn it on first (the API refuses them too). The page is display - the API enforces.
export default async function PlatformPage() {
  const { session } = await requirePageSession();
  const person = await prisma.user.findUnique({ where: { id: session.userId }, select: { isPlatformAdmin: true } });
  if (!person?.isPlatformAdmin) forbidden();
  const mfa = await hasActiveMfa(session.userId);

  return (
    <div>
      <PageHeader
        title="Platform"
        description="The schools on this installation. You see who they are and whether they are open - never what is inside them."
      />
      {mfa ? (
        <PlatformPanel />
      ) : (
        <Alert variant="warning" title="Turn on two-step verification first">
          The platform pages need it, because what you do here affects every school.{" "}
          <Link href="/account" className="font-semibold underline">
            Open your account
          </Link>{" "}
          to set it up, then come back.
        </Alert>
      )}
    </div>
  );
}
