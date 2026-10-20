// --- Pure Certificate Rules & Tamper-Evident Hashing (Phase 5) ---
import { createHash } from "node:crypto";

export interface CertificateFingerprintInput {
  tenantId: string;
  studentId: string;
  certificateNo: string;
  title: string;
  issueDate: Date | string;
}

/**
 * Computes a deterministic SHA-256 tamper-evident fingerprint for a certificate.
 */
export function computeCertificateHash(input: CertificateFingerprintInput): string {
  const dateStr = input.issueDate instanceof Date ? input.issueDate.toISOString() : new Date(input.issueDate).toISOString();
  const canonical = [input.tenantId, input.studentId, input.certificateNo.trim().toUpperCase(), input.title.trim(), dateStr].join("|");

  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Formats a standardized certificate serial number, unique within a school.
 * e.g., OCT-VOC-2026-00042. A prefix with no letter or digit in it (nothing is left of it once reduced to A-Z and 0-9) is the default, OCT.
 */
export function formatCertificateNumber(prefix: string, year: number, sequence: number): string {
  const sanitizedPrefix =
    (prefix || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "") || "OCT";
  const paddedSeq = sequence.toString().padStart(5, "0");
  return `${sanitizedPrefix}-VOC-${year}-${paddedSeq}`;
}

/**
 * Verifies certificate integrity against its recorded SHA-256 fingerprint.
 */
export function verifyCertificateIntegrity(input: CertificateFingerprintInput, expectedHash: string): boolean {
  const computed = computeCertificateHash(input);
  return computed.toLowerCase() === expectedHash.trim().toLowerCase();
}
