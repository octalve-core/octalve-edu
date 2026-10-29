import type { SchoolSettings } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";
import type { VerifiedTenantId } from "@/lib/tenant/verified-tenant";
import { resolveSchoolTimeZone } from "./school-day";

// The one internal read of a school's settings (domain-implementation-plan.md, "Build design — Phase 1.0", decision 2).
//
// Every school has exactly one row, inserted by the database when the school is (a trigger on "Tenant"), so a missing row is a
// BUG — a school created by something that bypassed the trigger, or a row deleted by hand — and it is reported as one. This function
// never invents defaults: code that silently falls back to "approval not required" or "no MFA for teachers" would be wrong in
// exactly the direction that matters. There is no write path in Phase 1.0; the settings screen (roadmap 1.7) adds it, with step-up MFA.
export async function getSchoolSettings(tx: Tx, tenantId: VerifiedTenantId): Promise<SchoolSettings> {
  const row = await tx.schoolSettings.findUnique({ where: { tenantId } });
  if (!row) throw new Error(`school ${tenantId} has no settings row — every school must (database trigger "tenant_creates_settings")`);
  return row;
}

/// The time zone a school's day follows, ready to use: the stored name when it is one this server knows, else "UTC" (what the daily limits always used). It reads the one column, and a
/// missing row is read as "UTC" and not reported here, unlike the settings above: this is not a control, and "UTC" is what every school had before the column existed.
export async function readSchoolTimeZone(tx: Tx, tenantId: string): Promise<string> {
  const row = await tx.schoolSettings.findUnique({ where: { tenantId }, select: { timeZone: true } });
  return resolveSchoolTimeZone(row?.timeZone);
}
