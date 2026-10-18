// --- Certificates Service (Phase 5) ---
import { CertificateStatus, Prisma } from "@prisma/client";
import { forTenant } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";
import { computeCertificateHash, formatCertificateNumber, verifyCertificateIntegrity } from "./rules";

export async function listCertificates(
  tenantId: string,
  filters: {
    studentId?: string;
    status?: CertificateStatus;
  } = {},
) {
  const tId = trustedTenantId(tenantId);
  return forTenant(tId).transaction(async (tx) => {
    const where: Prisma.CertificateWhereInput = { tenantId };
    if (filters.studentId) where.studentId = filters.studentId;
    if (filters.status) where.status = filters.status;

    return tx.certificate.findMany({
      where,
      orderBy: { issueDate: "desc" },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
        period: { select: { id: true, label: true } },
      },
    });
  });
}

export async function issueCertificate(
  tenantId: string,
  data: {
    studentId: string;
    periodId?: string;
    title: string;
    prefix?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const tId = trustedTenantId(tenantId);
  return forTenant(tId).transaction(async (tx) => {
    const year = new Date().getFullYear();
    const count = await tx.certificate.count({ where: { tenantId } });
    const certificateNo = formatCertificateNumber(data.prefix || "OCT", year, count + 1);
    const issueDate = new Date();

    const verificationHash = computeCertificateHash({
      tenantId,
      studentId: data.studentId,
      certificateNo,
      title: data.title,
      issueDate,
    });

    return tx.certificate.create({
      data: {
        tenantId,
        studentId: data.studentId,
        periodId: data.periodId || null,
        title: data.title.trim(),
        certificateNo,
        issueDate,
        verificationHash,
        metadata: data.metadata ? (data.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
        status: CertificateStatus.ISSUED,
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
        period: { select: { id: true, label: true } },
      },
    });
  });
}

export async function revokeCertificate(tenantId: string, certificateId: string) {
  const tId = trustedTenantId(tenantId);
  return forTenant(tId).transaction(async (tx) => {
    return tx.certificate.update({
      where: { id: certificateId, tenantId },
      data: { status: CertificateStatus.REVOKED },
    });
  });
}

export async function verifyPublicCertificate(certificateNo: string) {
  const sanitized = certificateNo.trim().toUpperCase();
  const { forVerification, setTenantContext } = await import("@/lib/tenant/for-tenant");
  const { trustedTenantId } = await import("@/lib/tenant/verified-tenant");

  return forVerification(sanitized).transaction(async (tx) => {
    const probe = await tx.certificate.findFirst({
      where: {
        certificateNo: sanitized,
        status: CertificateStatus.ISSUED,
      },
      select: { id: true, tenantId: true },
    });

    if (!probe) return null;

    await setTenantContext(tx, trustedTenantId(probe.tenantId));

    const certificate = await tx.certificate.findFirst({
      where: { id: probe.id },
      include: {
        tenant: { select: { id: true, name: true, code: true } },
        student: { select: { firstName: true, middleName: true, lastName: true } },
        period: { select: { label: true } },
      },
    });

    if (!certificate) return null;

    const studentName = [certificate.student.firstName, certificate.student.middleName, certificate.student.lastName]
      .filter(Boolean)
      .join(" ");

    const validHash = verifyCertificateIntegrity(
      {
        tenantId: certificate.tenantId,
        studentId: certificate.studentId,
        certificateNo: certificate.certificateNo,
        title: certificate.title,
        issueDate: certificate.issueDate,
      },
      certificate.verificationHash,
    );

    return {
      verified: validHash,
      certificateNo: certificate.certificateNo,
      title: certificate.title,
      studentName,
      institution: certificate.tenant.name,
      issueDate: certificate.issueDate,
      sessionPeriod: certificate.period?.label ?? null,
      metadata: certificate.metadata,
    };
  });
}
