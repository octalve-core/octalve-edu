import type { Metadata } from "next";
import { PublicQuestionnaire } from "@/components/forms/PublicQuestionnaire";

// A public questionnaire (task 0025, slice O5). Signed out on purpose: anyone with the link may answer. The link's token is the whole secret of a public form, so the page is kept out
// of search engines and does not pass its address on. The questionnaire itself is read by the screen from the public API, which decides whether the link can be answered (the school
// in the address must be the school that owns the questionnaire, otherwise it is "not found" like an unknown link).
export const metadata: Metadata = {
  title: "Questionnaire",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

export default async function PublicQuestionnairePage({ params }: { params: Promise<{ code: string; token: string }> }) {
  const { code, token } = await params;
  return <PublicQuestionnaire schoolCode={code} token={token} />;
}
