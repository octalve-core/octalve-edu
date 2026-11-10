import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { VerifyCredential } from "@/components/results/VerifyCredential";

// Where anyone checks a published mark by its code (task 0038). Signed out on purpose. The code is the whole secret of a lookup, so the pages are kept out of search engines and do not
// pass their address on.
export const metadata: Metadata = { title: "Check a report card mark", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default function VerifyPage() {
  return (
    <AuthShell>
      <VerifyCredential />
    </AuthShell>
  );
}
