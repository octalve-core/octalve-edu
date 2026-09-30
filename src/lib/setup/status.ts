import { prisma } from "@/lib/db";

/// Whether this Solo instance's first-run setup has been completed.
///
/// Returns `null` (unknown) on a database error instead of throwing, and
/// callers treat unknown as "don't redirect": a transient DB blip must never
/// lock a deployer out of their own bootstrap step (same fail-open call the
/// setup route and page already make). Only meaningful in Solo mode — SaaS
/// tenants are created by a separate self-serve flow, never this wizard.
export async function isSetupComplete(): Promise<boolean | null> {
  try {
    const settings = await prisma.systemSettings.findUnique({ where: { id: "global" } });
    return Boolean(settings?.setupComplete);
  } catch (err) {
    console.error("[SETUP_STATUS_ERROR]", err);
    return null;
  }
}

export const isSoloMode = () => process.env.DEPLOYMENT_MODE === "solo";
