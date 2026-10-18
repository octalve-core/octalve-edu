// --- Custom Domains Service (Phase 5) ---
import { DomainStatus } from "@prisma/client";
import { forTenant } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";
import { validateCustomDomain, generateDomainVerificationToken, getDnsVerificationInstructions } from "./rules";

export async function listCustomDomains(tenantId: string) {
  const tId = trustedTenantId(tenantId);
  return forTenant(tId).transaction(async (tx) => {
    const domains = await tx.customDomain.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });

    return domains.map((d) => ({
      ...d,
      dnsInstructions: getDnsVerificationInstructions(d.domain, d.verificationToken),
    }));
  });
}

export async function addCustomDomain(tenantId: string, domainInput: string) {
  const tId = trustedTenantId(tenantId);
  const validation = validateCustomDomain(domainInput);
  if (!validation.valid || !validation.normalized) {
    throw new Error(validation.error ?? "Invalid domain name");
  }

  const token = generateDomainVerificationToken();

  return forTenant(tId).transaction(async (tx) => {
    const record = await tx.customDomain.create({
      data: {
        tenantId,
        domain: validation.normalized!,
        verificationToken: token,
        status: DomainStatus.PENDING_VERIFICATION,
      },
    });

    return {
      ...record,
      dnsInstructions: getDnsVerificationInstructions(record.domain, record.verificationToken),
    };
  });
}

export async function verifyCustomDomain(tenantId: string, domainId: string, simulateSuccess = true) {
  const tId = trustedTenantId(tenantId);
  return forTenant(tId).transaction(async (tx) => {
    const domain = await tx.customDomain.findUniqueOrThrow({
      where: { id: domainId, tenantId },
    });

    if (simulateSuccess) {
      return tx.customDomain.update({
        where: { id: domain.id },
        data: {
          status: DomainStatus.ACTIVE,
          verifiedAt: new Date(),
          sslActive: true,
        },
      });
    } else {
      return tx.customDomain.update({
        where: { id: domain.id },
        data: {
          status: DomainStatus.FAILED,
        },
      });
    }
  });
}

export async function deleteCustomDomain(tenantId: string, domainId: string) {
  const tId = trustedTenantId(tenantId);
  return forTenant(tId).transaction(async (tx) => {
    return tx.customDomain.delete({
      where: { id: domainId, tenantId },
    });
  });
}
