import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { VerifyCredential } from "@/components/results/VerifyCredential";

// The link printed on a report card (task 0038) or under a certificate's QR code (task 0043): opens straight onto the answer for that code. Signed out on purpose; the code is the whole secret of the lookup, so the page is kept out
// of search engines and does not pass its address on. The answer is read by the screen from the public API (`/api/v1/verify/[token]`, then `/api/v1/verify-certificate/[token]`), which limit attempts and say noindex themselves.
export const metadata: Metadata = {
  title: "Check a mark or certificate",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

export default async function VerifyCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <AuthShell>
      <VerifyCredential code={code} />
    </AuthShell>
  );
}
