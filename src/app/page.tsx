import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isSetupComplete, isSoloMode } from "@/lib/setup/status";

// A pure router — never renders UI. Sends every visitor to the one place that
// makes sense for their state.
export const dynamic = "force-dynamic";

export default async function Home() {
  if (await getSession()) redirect("/dashboard");
  if (isSoloMode() && (await isSetupComplete()) === false) redirect("/setup");
  redirect("/login");
}
