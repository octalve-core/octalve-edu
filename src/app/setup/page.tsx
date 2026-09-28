import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SetupWizardForm } from "./SetupWizardForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  // SaaS mode has no single instance to bootstrap this way (PRD §4).
  if (process.env.DEPLOYMENT_MODE !== "solo") {
    notFound();
  }

  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "global" },
    });

    if (settings?.setupComplete) {
      redirect("/login");
    }
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) {
      const digest = (err as { digest?: string }).digest;
      if (digest?.startsWith("NEXT_REDIRECT")) throw err;
    }
    // Fail open on a DB blip — don't lock a deployer out of their own
    // bootstrap step because of a transient connection error.
    console.error("[SETUP_SERVER_CHECK_ERROR]", err);
  }

  const requiresToken = Boolean(process.env.SETUP_TOKEN);

  return <SetupWizardForm requiresToken={requiresToken} />;
}
