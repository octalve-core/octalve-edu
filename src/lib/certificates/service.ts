// --- Certificates Service (Phase 5) ---
import { CertificateStatus, Prisma } from "@prisma/client";
import { forTenant, forVerification, setTenantContext } from "@/lib/tenant/for-tenant";
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

/// Issues a certificate, or says why not (`STUDENT_NOT_FOUND`, `PERIOD_NOT_FOUND`: not in this school). The number is the school's next one (`<PREFIX>-VOC-<year>-<sequence>`); one issuer at a time per school holds the lock for the
/// count, so two requests never take the same number, and two schools may hold the same number. The verification token is the database's default.
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
    // Every refusal is decided before the first write.
    const student = await tx.studentRecord.findFirst({ where: { tenantId, id: data.studentId }, select: { id: true } });
    if (!student) return { ok: false as const, failure: "STUDENT_NOT_FOUND" as const };
    if (data.periodId) {
      const period = await tx.academicPeriod.findFirst({ where: { tenantId, id: data.periodId }, select: { id: true } });
      if (!period) return { ok: false as const, failure: "PERIOD_NOT_FOUND" as const };
    }

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`certificate-number:${tenantId}`}::text))`;
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

    const certificate = await tx.certificate.create({
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
    return { ok: true as const, certificate };
  });
}

export async function revokeCertificate(tenantId: string, certificateId: string) {
  const tId = trustedTenantId(tenantId);
  return forTenant(tId).transaction(async (tx) => {
    const found = await tx.certificate.findFirst({ where: { id: certificateId, tenantId }, select: { id: true } });
    if (!found) return null;
    return tx.certificate.update({
      where: { id: certificateId, tenantId },
      data: { status: CertificateStatus.REVOKED },
    });
  });
}

/// The public lookup: by the 32-character token, ISSUED certificates only (the `certificate_public_verification` policy says the same). A token that is
/// not 32 lower-case hex characters is "not found", as is one that matches nothing, a draft, or a revoked certificate.
export async function verifyPublicCertificate(token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;

  return forVerification(token).transaction(async (tx) => {
    const probe = await tx.certificate.findFirst({
      where: {
        verificationToken: token,
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
